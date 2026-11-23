import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { causeChain } from '../../common/errors/app.exception';
import type { MeetingRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PermanentJobError } from '../../infra/queue/base.processor';
import { StorageService } from '../../infra/storage/storage.service';
import { MeetingEventsService } from '../meetings/meeting-events.service';
import { summaryPreview, toAttendees } from '../meetings/meetings.mapper';
import { MeetingsRepository, TranscriptRepository } from '../meetings/meetings.repository';
import { NotificationProducer } from '../notifications/notification-producer.service';
import { ReminderSchedulerService } from '../reminders/reminder-scheduler.service';
import { RemindersRepository } from '../reminders/reminders.repository';
import { DEFAULT_REMINDER_CHANNELS, RemindersService } from '../reminders/reminders.service';
import { NameFixService } from '../memory/name-fix.service';
import { PeopleService } from '../memory/people.service';
import { CaptureInsightsService, type InsightsResult } from './capture-insights.service';
import { EmbeddingService } from './embedding.service';
import { ReportGeneratorService } from './report-generator.service';
import type { ReportOutput } from './report.schema';
import { computeTalkStats, transcriptDurationSeconds } from './talk-time';
import { formatTranscriptLines } from './transcript-format';
import { toRecordingParts, TranscriptionService } from './transcription.service';

/** Failure reason for a recording without usable speech (captures show "nothing to process"). */
export const NO_SPEECH_REASON = 'transcription: no speech was found in the recording';

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 to-dos, 1 reminder found" / "1 thing to confirm" / "Summary ready" for the capture_ready push. */
export function captureFoundText(todos: number, reminders: number, toConfirm: number): string {
  const found = [
    todos ? plural(todos, 'to-do', 'to-dos') : null,
    reminders ? plural(reminders, 'reminder', 'reminders') : null,
  ].filter(Boolean);
  const parts = [
    found.length ? `${found.join(', ')} found` : null,
    toConfirm ? plural(toConfirm, 'thing', 'things') + ' to confirm' : null,
  ];
  return parts.filter(Boolean).join(', ') || 'Summary ready';
}

/**
 * Report → action items → participants → reminders → embeddings → completed (HLD §5.3).
 * Captures (recorded conversations, user-flow §04) are transcribed part by part, get insights (people,
 * facts, mood) and keep unclear reminders as suggestions; their raw audio is deleted once processed.
 */
@Injectable()
export class AiPipelineService {
  private readonly logger = new Logger(AiPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meetings: MeetingsRepository,
    private readonly transcripts: TranscriptRepository,
    private readonly events: MeetingEventsService,
    private readonly generator: ReportGeneratorService,
    private readonly transcription: TranscriptionService,
    private readonly embeddings: EmbeddingService,
    private readonly reminders: RemindersRepository,
    private readonly remindersService: RemindersService,
    private readonly reminderScheduler: ReminderSchedulerService,
    private readonly notifications: NotificationProducer,
    private readonly config: AppConfig,
    private readonly captureInsights: CaptureInsightsService,
    private readonly storage: StorageService,
    private readonly nameFix: NameFixService,
    private readonly people: PeopleService,
  ) {}

  async process(
    meetingId: string,
    opts: { transcribe?: boolean } = {},
  ): Promise<{ actionItems: number; reminders: number; chunks: number }> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting) throw new PermanentJobError('Meeting no longer exists');
    if (meeting.status === 'cancelled') throw new PermanentJobError('Meeting was cancelled');
    if (meeting.status !== 'processing') await this.events.setStatus(meeting.id, 'processing', { failureReason: null });

    const isCapture = meeting.source === 'capture';
    const parts = toRecordingParts(meeting.recordingParts);
    if (opts.transcribe) {
      let transcribed;
      if (parts.length) {
        transcribed = await this.transcription.transcribeParts(parts);
      } else {
        if (!meeting.recordingPath) throw new PermanentJobError('upload: no recording to transcribe');
        transcribed = await this.transcription.transcribe(meeting.recordingPath);
      }
      if (!transcribed.length) throw new PermanentJobError(NO_SPEECH_REASON);
      await this.transcripts.replaceAll(meeting.id, transcribed);
    }

    // Names the user fixed before ("Raul" → "Rahul") are applied first, so the summary uses them too (§10).
    await this.nameFix
      .correctTranscript(meeting.id, meeting.userId)
      .catch((err: unknown) => this.logger.warn({ meetingId, causes: causeChain(err) }, 'name corrections failed'));
    const segments = await this.transcripts.listAll(meeting.id);
    if (!segments.length) throw new PermanentJobError('ai: the meeting has no transcript to process');
    const user = await this.prisma.user.findUnique({
      where: { id: meeting.userId },
      select: {
        name: true,
        email: true,
        timezone: true,
        profile: { select: { languageStyle: true, preferredName: true } },
      },
    });
    if (!user) throw new PermanentJobError('User no longer exists');
    // What the user asked to be called (onboarding / You) wins over the account name in summaries and facts;
    // the account name is still passed so the model knows it is the same person when it comes up.
    const accountName = user.name?.trim() || null;
    const callName = user.profile?.preferredName?.trim() || accountName || user.email;
    const alsoKnownAs = accountName && accountName !== callName ? accountName : null;

    const lines = formatTranscriptLines(segments);
    const attendees = toAttendees(meeting.attendees);
    const generated = await this.generator.generate({
      lines,
      meetingTitle: meeting.title,
      meetingStart: meeting.startAt,
      attendees: attendees.map((a) => a.name ?? a.email).filter(Boolean),
      userName: callName,
      userAlsoKnownAs: alsoKnownAs,
      userEmail: user.email,
      timezone: user.timezone,
    });
    const report = generated.output;
    const stats = computeTalkStats(segments);

    let insights: InsightsResult | null = null;
    if (isCapture) {
      insights = await this.captureInsights.generate({
        lines: lines.join('\n'),
        reminders: report.reminders,
        userName: callName,
        userAlsoKnownAs: alsoKnownAs,
        timezone: user.timezone,
        languageStyle: user.profile?.languageStyle ?? 'english',
      });
      // Recorded meeting with attendees (linked calendar event): draft the recap email (user-flow §06).
      const recipients = attendees
        .filter((a) => a.email && a.email.toLowerCase() !== user.email.toLowerCase())
        .map((a) => ({ name: a.name, email: a.email }));
      const followUp = recipients.length
        ? await this.captureInsights.followUp({
            userName: user.name ?? user.email,
            title: meeting.title,
            attendees: recipients,
            summary: report.summary,
            decisions: report.decisions,
            actionItems: report.actionItems.map((a) => ({
              title: a.title,
              assigneeName: a.assigneeName,
              dueAt: a.dueAt,
            })),
          })
        : null;
      if (followUp) insights.extra = { followUp };
    }

    const oldAiReminders = await this.reminders.pendingAiForMeeting(meeting.id);
    await this.saveReport(meeting, report, generated.model, generated.promptVersion, stats, attendees, insights);
    for (const r of oldAiReminders) await this.reminderScheduler.unschedule(r.id);
    const reminderCount = await this.createReminders(meeting, report, insights?.heldBack);

    let chunks = 0;
    try {
      const digest = [`Meeting: ${meeting.title}`, report.summary, ...report.keyPoints, ...report.decisions].join('\n');
      chunks = await this.embeddings.indexMeeting(meeting.id, meeting.userId, digest, lines);
    } catch (err) {
      // The report is saved; Ask AI just won't see this meeting until it is reprocessed.
      this.logger.error(
        { meetingId, causes: causeChain(err) },
        'embedding failed; meeting completed without memory index',
      );
    }

    const durationSeconds = meeting.durationSeconds ?? transcriptDurationSeconds(segments);
    await this.events.setStatus(meeting.id, 'completed', { durationSeconds, failureReason: null });
    // People cards: everyone in this conversation (memory, §10).
    await this.people
      .syncMeeting(meeting.id)
      .catch((err: unknown) => this.logger.warn({ meetingId, causes: causeChain(err) }, 'people cards not updated'));

    if (isCapture) {
      // Raw audio is not kept: only the transcript, summary and extracted items stay.
      const paths = [...parts.map((p) => p.path), ...(meeting.recordingPath ? [meeting.recordingPath] : [])];
      await this.storage.remove(paths);
      await this.meetings.update(meeting.id, { recordingParts: [], recordingPath: null });
      const toConfirm = insights?.insights.suggestions.length ?? 0;
      await this.notifications.notify({
        userId: meeting.userId,
        type: 'capture_ready',
        templateKey: 'capture_ready',
        vars: {
          title: meeting.title,
          foundText: captureFoundText(report.actionItems.length, reminderCount, toConfirm),
          summaryPreview: summaryPreview(report.summary, 140),
        },
        data: { captureId: meeting.id, url: `/capture/${meeting.id}` },
        channels: ['push', 'in_app'],
      });
      this.logger.log(
        { meetingId, actionItems: report.actionItems.length, reminders: reminderCount, toConfirm, chunks },
        'capture processed',
      );
      return { actionItems: report.actionItems.length, reminders: reminderCount, chunks };
    }

    await this.notifications.notify({
      userId: meeting.userId,
      type: 'report_ready',
      templateKey: 'report_ready',
      vars: {
        meetingTitle: meeting.title,
        actionItemCount: report.actionItems.length,
        summaryPreview: summaryPreview(report.summary, 140),
        summary: report.summary,
        url: `${this.config.urls.web}/analytics/reports/${meeting.id}`,
      },
      data: { meetingId: meeting.id, url: `/analytics/reports/${meeting.id}` },
    });
    this.logger.log(
      {
        meetingId,
        actionItems: report.actionItems.length,
        reminders: reminderCount,
        chunks,
        repaired: generated.repaired,
      },
      'meeting processed',
    );
    return { actionItems: report.actionItems.length, reminders: reminderCount, chunks };
  }

  /** Report upsert + AI action items + participants, atomically. */
  private async saveReport(
    meeting: MeetingRow,
    report: ReportOutput,
    model: string,
    promptVersion: number | null,
    stats: ReturnType<typeof computeTalkStats>,
    attendees: ReturnType<typeof toAttendees>,
    insights: InsightsResult | null = null,
  ): Promise<void> {
    const emailByName = new Map(attendees.filter((a) => a.name).map((a) => [a.name!.toLowerCase(), a.email]));
    const reportData = {
      ...(insights
        ? { insights: { ...insights.insights, ...insights.extra } as unknown as Prisma.InputJsonValue }
        : {}),
      userId: meeting.userId,
      summary: report.summary,
      keyPoints: report.keyPoints as Prisma.InputJsonValue,
      chapters: report.chapters as Prisma.InputJsonValue,
      keyQuestions: report.keyQuestions as Prisma.InputJsonValue,
      decisions: report.decisions as Prisma.InputJsonValue,
      topics: report.topics,
      sentimentScore: report.sentimentScore,
      engagementScore: report.engagementScore,
      meetingScore: report.meetingScore,
      sentimentLabel: report.sentimentLabel,
      model,
      promptVersion,
      raw: { generatedAt: new Date().toISOString(), model } as Prisma.InputJsonValue,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.meetingReport.upsert({
        where: { meetingId: meeting.id },
        create: { meetingId: meeting.id, ...reportData },
        update: reportData,
      });
      await tx.reminder.updateMany({
        where: { meetingId: meeting.id, source: 'ai', status: 'pending' },
        data: { status: 'cancelled' },
      });
      await tx.actionItem.deleteMany({ where: { meetingId: meeting.id, source: 'ai' } });
      if (report.actionItems.length) {
        await tx.actionItem.createMany({
          data: report.actionItems.map((a) => ({
            userId: meeting.userId,
            meetingId: meeting.id,
            title: a.title,
            description: a.description,
            assigneeName: a.assigneeName,
            assigneeEmail: a.assigneeName ? (emailByName.get(a.assigneeName.toLowerCase()) ?? null) : null,
            isMine: a.isMine,
            dueAt: a.dueAt ? new Date(a.dueAt) : null,
            priority: a.priority,
            source: 'ai',
          })),
        });
      }
      await tx.meetingParticipant.deleteMany({ where: { meetingId: meeting.id } });
      if (stats.length) {
        await tx.meetingParticipant.createMany({
          data: stats.map((s) => ({
            meetingId: meeting.id,
            name: s.name.slice(0, 200),
            email: emailByName.get(s.name.toLowerCase()) ?? null,
            talkTimeSeconds: s.talkTimeSeconds,
            wordCount: s.wordCount,
            talkRatio: s.talkRatio,
          })),
          skipDuplicates: true,
        });
      }
    });
  }

  /** Schedules the report's reminders, except `heldBack` ones (capture suggestions waiting for the user). */
  private async createReminders(meeting: MeetingRow, report: ReportOutput, heldBack?: Set<number>): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [i, r] of report.reminders.entries()) {
      if (heldBack?.has(i)) continue;
      if (!r.remindAt || new Date(r.remindAt).getTime() <= now + 60_000) continue;
      await this.remindersService.createAndSchedule({
        userId: meeting.userId,
        meetingId: meeting.id,
        type: 'commitment',
        source: 'ai',
        title: r.title,
        body: r.body,
        remindAt: new Date(r.remindAt),
        channels: DEFAULT_REMINDER_CHANNELS,
      });
      count++;
    }
    return count;
  }

  /** After the last attempt: record the failure on the meeting and tell the user. */
  async markFailed(meetingId: string, reason: string): Promise<void> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || meeting.status === 'completed' || meeting.status === 'cancelled') return;
    const failureReason = reason.slice(0, 300);
    await this.events.setStatus(meetingId, 'failed', { failureReason });
    if (meeting.source === 'capture') {
      // The audio is kept so the user can retry; nothing to retry when there was no speech.
      const noSpeech = failureReason === NO_SPEECH_REASON;
      await this.notifications.notify({
        userId: meeting.userId,
        type: 'capture_ready',
        templateKey: 'reminder',
        vars: {
          title: noSpeech ? `Nothing to process in "${meeting.title}"` : `We couldn't process "${meeting.title}"`,
          body: noSpeech
            ? 'The recording had no speech we could understand.'
            : 'Your recording is saved. Open it to try again.',
        },
        data: { captureId: meetingId, url: `/capture/${meetingId}` },
        channels: ['in_app', 'push'],
      });
      return;
    }
    await this.notifications.notify({
      userId: meeting.userId,
      type: 'reminder',
      templateKey: 'reminder',
      vars: { title: `We couldn't process "${meeting.title}"`, body: failureReason },
      data: { meetingId, url: `/analytics/reports/${meetingId}` },
      channels: ['in_app', 'push'],
    });
  }
}
