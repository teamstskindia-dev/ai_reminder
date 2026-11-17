import { Injectable, Logger } from '@nestjs/common';
import { Schema, Type } from '@google/genai';
import { z } from 'zod';
import { causeChain } from '../../common/errors/app.exception';
import type { MeetingPrep } from '../../common/types/api.types';
import { renderTemplate } from '../../common/utils/template.util';
import { formatTime } from '../../common/utils/time.util';
import { GeminiService, parseJsonLoose } from '../../infra/gemini/gemini.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CacheService } from '../../infra/redis/cache.service';
import { PromptsRepository } from '../ai/prompts.repository';
import { SettingsService } from '../content/settings.service';
import { summaryPreview, toActionItem, toAttendees } from './meetings.mapper';
import { MeetingsRepository } from './meetings.repository';
import { endOf, nextBackToBack, overlaps } from './overlap.util';

const POINTS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: { points: { type: Type.ARRAY, items: { type: Type.STRING } } },
  required: ['points'],
};
const pointsOutput = z.object({
  points: z
    .array(z.string())
    .catch([])
    .transform((l) =>
      l
        .map((p) => p.replace(/\s+/g, ' ').trim().slice(0, 140))
        .filter(Boolean)
        .slice(0, 4),
    ),
});

const PREP_TTL_SECONDS = 6 * 3600;

function firstName(s: string | null | undefined): string {
  return (s ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

/**
 * The pre-meeting brief (user-flow §06): who is coming, what you last discussed with them, open promises
 * both ways, suggested talking points, double-bookings and the next back-to-back meeting.
 */
@Injectable()
export class MeetingPrepService {
  private readonly logger = new Logger(MeetingPrepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meetings: MeetingsRepository,
    private readonly gemini: GeminiService,
    private readonly prompts: PromptsRepository,
    private readonly settings: SettingsService,
    private readonly cache: CacheService,
  ) {}

  async build(userId: string, id: string): Promise<MeetingPrep> {
    const meeting = await this.meetings.findForUser(userId, id);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, timezone: true },
    });
    const selfEmail = (user?.email ?? '').toLowerCase();
    const attendees = toAttendees(meeting.attendees)
      .filter((a) => a.email && a.email.toLowerCase() !== selfEmail)
      .map((a) => ({ name: a.name, email: a.email }));
    const emails = new Set(attendees.map((a) => a.email.toLowerCase()));
    const names = new Set(attendees.map((a) => firstName(a.name ?? a.email.split('@')[0])).filter((n) => n.length > 1));

    // Earlier conversations with the same people: shared attendee email, or a person named in a recording.
    const past = await this.prisma.meeting.findMany({
      where: { userId, id: { not: id }, status: 'completed', startAt: { lt: meeting.startAt } },
      orderBy: { startAt: 'desc' },
      take: 150,
      select: {
        id: true,
        title: true,
        startAt: true,
        source: true,
        attendees: true,
        report: { select: { summary: true, insights: true, decisions: true } },
      },
    });
    const related = attendees.length
      ? past.filter((p) => {
          if (toAttendees(p.attendees).some((a) => emails.has(a.email.toLowerCase()))) return true;
          const people = (p.report?.insights as { people?: { name?: string }[] } | null)?.people ?? [];
          return people.some((x) => names.has(firstName(x.name)));
        })
      : [];
    const relatedIds = related.map((r) => r.id);

    const openItems = relatedIds.length
      ? await this.prisma.actionItem.findMany({
          where: { userId, meetingId: { in: relatedIds }, status: 'open' },
          include: { meeting: { select: { title: true } } },
          orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
          take: 20,
        })
      : [];
    const mine = openItems.filter((a) => a.isMine).slice(0, 5);
    const theirs = openItems
      .filter((a) => !a.isMine && (!a.assigneeName || names.has(firstName(a.assigneeName))))
      .slice(0, 5);

    const others = await this.prisma.meeting.findMany({
      where: {
        userId,
        id: { not: id },
        source: { not: 'capture' },
        status: { notIn: ['cancelled', 'failed'] },
        startAt: {
          gte: new Date(meeting.startAt.getTime() - 6 * 3600_000),
          lte: new Date(endOf(meeting).getTime() + 3600_000),
        },
      },
      select: { id: true, title: true, startAt: true, endAt: true },
    });
    const conflicts = others.filter((o) => overlaps(meeting, o));
    const next = nextBackToBack(meeting, others);
    const recording = await this.prisma.meeting.findFirst({
      where: { userId, linkedMeetingId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const lastDiscussed = related.slice(0, 3).map((r) => ({
      id: r.id,
      title: r.title,
      startAt: r.startAt.toISOString(),
      summaryPreview: r.report?.summary ? summaryPreview(r.report.summary, 200) : null,
      isCapture: r.source === 'capture',
    }));

    const talkingPoints = await this.cache.wrap(
      `prep:${id}:${meeting.updatedAt.getTime()}:${openItems.length}`,
      PREP_TTL_SECONDS,
      () =>
        this.talkingPoints({
          userName: user?.name ?? user?.email ?? 'the user',
          title: meeting.title,
          startTime: formatTime(meeting.startAt, user?.timezone ?? 'UTC'),
          attendees: attendees.map((a) => a.name ?? a.email).join(', ') || 'no listed attendees',
          lastDiscussed: related
            .slice(0, 3)
            .map((r) => `- ${r.title}: ${summaryPreview(r.report?.summary ?? '', 300)}`)
            .join('\n'),
          promises: [
            ...mine.map((a) => `- You promised: ${a.title}`),
            ...theirs.map((a) => `- ${a.assigneeName ?? 'They'} promised: ${a.title}`),
          ].join('\n'),
          fallback: [...theirs.map((a) => `Check on: ${a.title}`), ...mine.map((a) => `Update on: ${a.title}`)],
        }),
    );

    const ref = (m: { id: string; title: string; startAt: Date; endAt: Date | null }) => ({
      id: m.id,
      title: m.title,
      startAt: m.startAt.toISOString(),
      endAt: m.endAt?.toISOString() ?? null,
    });
    return {
      meetingId: meeting.id,
      title: meeting.title,
      startAt: meeting.startAt.toISOString(),
      endAt: meeting.endAt?.toISOString() ?? null,
      attendees,
      lastDiscussed,
      promises: {
        mine: mine.map((a) => toActionItem(a, a.meeting?.title ?? null)),
        theirs: theirs.map((a) => toActionItem(a, a.meeting?.title ?? null)),
      },
      talkingPoints,
      conflicts: conflicts.map(ref),
      nextUp: next ? ref(next) : null,
      recordingId: recording?.id ?? null,
    };
  }

  private async talkingPoints(input: {
    userName: string;
    title: string;
    startTime: string;
    attendees: string;
    lastDiscussed: string;
    promises: string;
    fallback: string[];
  }): Promise<string[]> {
    const fallback = input.fallback.slice(0, 4);
    if (this.gemini.isMock) return fallback;
    try {
      const [ai, prompt] = await Promise.all([this.settings.get('ai'), this.prompts.get('meeting_prep')]);
      if (!prompt) return fallback;
      const { text } = await this.gemini.generateJson({
        operation: 'meeting_prep',
        model: ai.model,
        systemInstruction: renderTemplate(prompt.content, {
          userName: input.userName,
          title: input.title,
          startTime: input.startTime,
          attendees: input.attendees,
          lastDiscussed: input.lastDiscussed || '(nothing recorded yet)',
          promises: input.promises || '(none)',
        }),
        contents: 'Suggest the talking points.',
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseSchema: POINTS_SCHEMA,
      });
      const points = pointsOutput.parse(parseJsonLoose(text)).points;
      return points.length ? points : fallback;
    } catch (err) {
      this.logger.warn({ causes: causeChain(err) }, 'meeting prep talking points fell back');
      return fallback;
    }
  }
}
