import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { causeChain } from '../../common/errors/app.exception';
import type { MeetingRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PermanentJobError } from '../../infra/queue/base.processor';
import { MeetingEventsService } from '../meetings/meeting-events.service';
import { summaryPreview, toAttendees } from '../meetings/meetings.mapper';
import { MeetingsRepository, TranscriptRepository } from '../meetings/meetings.repository';
import { NotificationProducer } from '../notifications/notification-producer.service';
import { ReminderSchedulerService } from '../reminders/reminder-scheduler.service';
import { RemindersRepository } from '../reminders/reminders.repository';
import { DEFAULT_REMINDER_CHANNELS, RemindersService } from '../reminders/reminders.service';
import { EmbeddingService } from './embedding.service';
import { ReportGeneratorService } from './report-generator.service';
import type { ReportOutput } from './report.schema';
import { computeTalkStats, transcriptDurationSeconds } from './talk-time';
import { formatTranscriptLines } from './transcript-format';
import { TranscriptionService } from './transcription.service';

/** Report → action items → participants → reminders → embeddings → completed (HLD §5.3). */
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
  ) {}

  async process(
    meetingId: string,
    opts: { transcribe?: boolean } = {},
  ): Promise<{ actionItems: number; reminders: number; chunks: number }> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting) throw new PermanentJobError('Meeting no longer exists');
    if (meeting.status === 'cancelled') throw new PermanentJobError('Meeting was cancelled');
    if (meeting.status !== 'processing') await this.events.setStatus(meeting.id, 'processing', { failureReason: null });

    if (opts.transcribe) {
      if (!meeting.recordingPath) throw new PermanentJobError('upload: no recording to transcribe');
      const segments = await this.transcription.transcribe(meeting.recordingPath);
      if (!segments.length) throw new PermanentJobError('transcription: no speech was found in the recording');
      await this.transcripts.replaceAll(meeting.id, segments);
    }

    const segments = await this.transcripts.listAll(meeting.id);
    if (!segments.length) throw new PermanentJobError('ai: the meeting has no transcript to process');
    const user = await this.prisma.user.findUnique({
      where: { id: meeting.userId },
      select: { name: true, email: true, timezone: true },
    });
    if (!user) throw new PermanentJobError('User no longer exists');

    const lines = formatTranscriptLines(segments);
    const attendees = toAttendees(meeting.attendees);
    const generated = await this.generator.generate({
      lines,
      meetingTitle: meeting.title,
      meetingStart: meeting.startAt,
      attendees: attendees.map((a) => a.name ?? a.email).filter(Boolean),
      userName: user.name ?? user.email,
      userEmail: user.email,
      timezone: user.timezone,
    });
    const report = generated.output;
    const stats = computeTalkStats(segments);

    const oldAiReminders = await this.reminders.pendingAiForMeeting(meeting.id);
    await this.saveReport(meeting, report, generated.model, generated.promptVersion, stats, attendees);
    for (const r of oldAiReminders) await this.reminderScheduler.unschedule(r.id);
    const reminderCount = await this.createReminders(meeting, report);

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
  ): Promise<void> {
    const emailByName = new Map(attendees.filter((a) => a.name).map((a) => [a.name!.toLowerCase(), a.email]));
    const reportData = {
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

  private async createReminders(meeting: MeetingRow, report: ReportOutput): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const r of report.reminders) {
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
