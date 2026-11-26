import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { escapeLike } from '../../common/utils/postgrest.util';
import type { NameCorrection } from '../../common/types/api.types';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PeopleService } from './people.service';
import {
  addCorrection,
  applyCorrections,
  cleanName,
  isGenericSpeaker,
  replaceName,
  sameName,
  toCorrections,
} from './memory.util';

/** Replaces a name in every string inside a JSON value (summary lists, insights …). */
function deepReplace(value: unknown, from: string, to: string): unknown {
  if (typeof value === 'string') return replaceName(value, from, to);
  if (Array.isArray(value)) return value.map((v) => deepReplace(v, from, to));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepReplace(v, from, to)]));
  }
  return value;
}

const MAX_CONVERSATIONS = 200;

/**
 * "Fix once, fixed everywhere" (user-flow §10): correcting a name in one transcript updates every
 * conversation that has it (speaker labels, transcript, summary, to-dos, reminders), the person card, and
 * future recognition: the correction is applied to every new transcript before its summary is written.
 */
@Injectable()
export class NameFixService {
  private readonly logger = new Logger(NameFixService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly people: PeopleService,
  ) {}

  async corrections(userId: string): Promise<NameCorrection[]> {
    const p = await this.prisma.userProfile.findUnique({ where: { userId }, select: { corrections: true } });
    return toCorrections(p?.corrections);
  }

  async removeCorrection(userId: string, from: string): Promise<NameCorrection[]> {
    const next = (await this.corrections(userId)).filter((c) => !sameName(c.from, from));
    await this.prisma.userProfile.updateMany({
      where: { userId },
      data: { corrections: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  }

  /** New transcript (AI pipeline, before the report): applies the user's saved name corrections. */
  async correctTranscript(meetingId: string, userId: string): Promise<number> {
    const corrections = await this.corrections(userId);
    if (!corrections.length) return 0;
    const segments = await this.prisma.transcriptSegment.findMany({
      where: { meetingId },
      select: { id: true, speaker: true, text: true },
    });
    const changed = segments
      .map((s) => ({
        id: s.id,
        speaker: applyCorrections(s.speaker, corrections),
        text: applyCorrections(s.text, corrections),
        before: s,
      }))
      .filter((s) => s.speaker !== s.before.speaker || s.text !== s.before.text);
    if (!changed.length) return 0;
    await this.prisma.$transaction(
      changed.map((s) =>
        this.prisma.transcriptSegment.update({
          where: { id: s.id },
          data: { speaker: s.speaker.slice(0, 200), text: s.text },
        }),
      ),
    );
    this.logger.log({ meetingId, segments: changed.length }, 'name corrections applied');
    return changed.length;
  }

  /**
   * "Fix a name" in a conversation. A real name ("Raul" → "Rahul") is fixed in every conversation that has it
   * (unless `onlyHere`) and remembered for next time; a generic label ("Speaker 2" → "Rahul") only here.
   */
  async fixInConversation(
    userId: string,
    meetingId: string,
    rawFrom: string,
    rawTo: string,
    opts: { onlyHere?: boolean } = {},
  ): Promise<{ conversations: number; remembered: boolean }> {
    const from = cleanName(rawFrom);
    const to = cleanName(rawTo);
    if (!from || !to) throw AppException.badRequest('Both names are required');
    const meeting = await this.prisma.meeting.findFirst({ where: { id: meetingId, userId }, select: { id: true } });
    if (!meeting) throw AppException.notFound('Conversation');
    if (from === to) return { conversations: 0, remembered: false };

    const real = !isGenericSpeaker(from);
    const ids = new Set([meetingId]);
    if (real && !opts.onlyHere) for (const id of await this.conversationsWith(userId, from)) ids.add(id);
    for (const id of ids) await this.renameInMeeting(id, from, to);

    for (const id of ids) await this.people.syncMeeting(id);
    // After the sync, so the "to" card exists: the old card merges into it and "from" stays as a spelling.
    if (real && !opts.onlyHere) {
      await this.remember(userId, from, to);
      await this.people.renameCard(userId, from, to);
    }
    this.logger.log({ userId, conversations: ids.size, real }, 'name fixed');
    return { conversations: ids.size, remembered: real && !opts.onlyHere };
  }

  /** A person card renamed by the user: the new name everywhere they appear, remembered for next time. */
  async renamePerson(userId: string, personId: string, rawName: string): Promise<void> {
    const person = await this.people.require(userId, personId);
    const to = cleanName(rawName);
    if (!to) throw AppException.badRequest('A name is required');
    const from = person.name;
    if (from === to) return;
    const ids = new Set([...person.meetingIds, ...(await this.conversationsWith(userId, from))]);
    for (const id of ids) await this.renameInMeeting(id, from, to);
    if (!sameName(from, to)) await this.remember(userId, from, to);
    await this.people.renameCard(userId, from, to);
  }

  private async remember(userId: string, from: string, to: string): Promise<void> {
    const next = addCorrection(await this.corrections(userId), from, to);
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, status: 'skipped', corrections: next as unknown as Prisma.InputJsonValue },
      update: { corrections: next as unknown as Prisma.InputJsonValue },
    });
  }

  /** The user's finished conversations where the name appears (speaker, participant or summary). */
  private async conversationsWith(userId: string, name: string): Promise<string[]> {
    const like = `%${escapeLike(name)}%`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      select m.id from public.meetings m
       where m.user_id = ${userId}::uuid and m.status = 'completed'
         and (exists (select 1 from public.meeting_participants p where p.meeting_id = m.id and lower(p.name) = lower(${name}))
           or exists (select 1 from public.transcript_segments s where s.meeting_id = m.id and lower(s.speaker) = lower(${name}))
           or exists (select 1 from public.meeting_reports r where r.meeting_id = m.id and r.summary ilike ${like}))
       order by m.start_at desc
       limit ${MAX_CONVERSATIONS}`);
    return rows.map((r) => r.id);
  }

  /** Speaker labels, transcript, participants, summary, to-dos, reminders and memory chunks of one meeting. */
  private async renameInMeeting(meetingId: string, from: string, to: string): Promise<void> {
    const [meeting, segments, participants, report, items, reminders, chunks] = await Promise.all([
      this.prisma.meeting.findUnique({ where: { id: meetingId }, select: { title: true } }),
      this.prisma.transcriptSegment.findMany({ where: { meetingId }, select: { id: true, speaker: true, text: true } }),
      this.prisma.meetingParticipant.findMany({ where: { meetingId } }),
      this.prisma.meetingReport.findUnique({ where: { meetingId } }),
      this.prisma.actionItem.findMany({
        where: { meetingId },
        select: { id: true, title: true, description: true, assigneeName: true },
      }),
      this.prisma.reminder.findMany({ where: { meetingId }, select: { id: true, title: true, body: true } }),
      this.prisma.meetingChunk.findMany({ where: { meetingId }, select: { id: true, content: true } }),
    ]);
    if (!meeting) return;
    const ops: Prisma.PrismaPromise<unknown>[] = [];

    const title = replaceName(meeting.title, from, to);
    if (title !== meeting.title) ops.push(this.prisma.meeting.update({ where: { id: meetingId }, data: { title } }));

    for (const s of segments) {
      const speaker = sameName(s.speaker, from) ? to : s.speaker;
      const text = replaceName(s.text, from, to);
      if (speaker !== s.speaker || text !== s.text) {
        ops.push(this.prisma.transcriptSegment.update({ where: { id: s.id }, data: { speaker, text } }));
      }
    }

    const target = participants.find((p) => sameName(p.name, to));
    for (const p of participants.filter((x) => sameName(x.name, from))) {
      if (target && target.id !== p.id) {
        const words = target.wordCount + p.wordCount;
        ops.push(
          this.prisma.meetingParticipant.update({
            where: { id: target.id },
            data: {
              talkTimeSeconds: target.talkTimeSeconds + p.talkTimeSeconds,
              wordCount: words,
              talkRatio: new Prisma.Decimal(target.talkRatio).plus(p.talkRatio),
              email: target.email ?? p.email,
            },
          }),
          this.prisma.meetingParticipant.delete({ where: { id: p.id } }),
        );
      } else {
        ops.push(this.prisma.meetingParticipant.update({ where: { id: p.id }, data: { name: to } }));
      }
    }

    if (report) {
      ops.push(
        this.prisma.meetingReport.update({
          where: { meetingId },
          data: {
            summary: replaceName(report.summary, from, to),
            keyPoints: deepReplace(report.keyPoints, from, to) as Prisma.InputJsonValue,
            chapters: deepReplace(report.chapters, from, to) as Prisma.InputJsonValue,
            keyQuestions: deepReplace(report.keyQuestions, from, to) as Prisma.InputJsonValue,
            decisions: deepReplace(report.decisions, from, to) as Prisma.InputJsonValue,
            ...(report.insights ? { insights: deepReplace(report.insights, from, to) as Prisma.InputJsonValue } : {}),
          },
        }),
      );
    }

    for (const i of items) {
      const data = {
        title: replaceName(i.title, from, to),
        description: i.description ? replaceName(i.description, from, to) : i.description,
        assigneeName: i.assigneeName && sameName(i.assigneeName, from) ? to : i.assigneeName,
      };
      if (data.title !== i.title || data.description !== i.description || data.assigneeName !== i.assigneeName) {
        ops.push(this.prisma.actionItem.update({ where: { id: i.id }, data }));
      }
    }
    for (const r of reminders) {
      const data = { title: replaceName(r.title, from, to), body: r.body ? replaceName(r.body, from, to) : r.body };
      if (data.title !== r.title || data.body !== r.body)
        ops.push(this.prisma.reminder.update({ where: { id: r.id }, data }));
    }
    // Ask AI quotes these chunks; the vectors barely change for a name, so they are not re-embedded.
    for (const c of chunks) {
      const content = replaceName(c.content, from, to);
      if (content !== c.content) {
        ops.push(this.prisma.$executeRaw`update public.meeting_chunks set content = ${content} where id = ${c.id}`);
      }
    }
    if (ops.length) await this.prisma.$transaction(ops);
  }
}
