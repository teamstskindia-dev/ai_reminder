import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AppException } from '../../common/errors/app.exception';
import { detectFileType } from '../../common/files/detect-file-type';
import { validateMeetingUpload } from '../../common/files/file-validation';
import type { CaptureDetail, CaptureInsights, CaptureListItem } from '../../common/types/api.types';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { removeJob, upsertJob } from '../../infra/queue/job-utils';
import { AiProcessJob, JOB, JobId, QUEUE } from '../../infra/queue/queue.constants';
import { StorageService } from '../../infra/storage/storage.service';
import { NO_SPEECH_REASON } from '../ai/ai-pipeline.service';
import { CaptureInsightsService, toCaptureInsights, toFollowUp } from '../ai/capture-insights.service';
import { toRecordingParts } from '../ai/transcription.service';
import { CompanionChatService } from '../companion/companion-chat.service';
import { toAttendees } from '../meetings/meetings.mapper';
import { DEFAULT_REMINDER_CHANNELS, RemindersService } from '../reminders/reminders.service';
import {
  CreateCaptureDto,
  FinishCaptureDto,
  FollowUpDecisionDto,
  MAX_CAPTURE_MS,
  MAX_CAPTURE_PARTS,
  ReviewCaptureDto,
  UpdateCaptureDto,
  UploadCapturePartDto,
} from './captures.dto';
import {
  CAPTURE_DETAIL_INCLUDE,
  CAPTURE_LIST_INCLUDE,
  toCaptureDetail,
  toCaptureListItem,
  type CaptureDetailRow,
} from './captures.mapper';
import { defaultCaptureTitle, MIN_CAPTURE_MS } from './captures.util';

export interface UploadedPart {
  originalname?: string;
  buffer: Buffer;
  size: number;
}

/**
 * Tap to record a conversation (user-flow §04). A capture is a meeting with source `capture`:
 * created when the phone starts uploading, filled part by part (crash-safe chunks, retried from the
 * phone's offline queue), then queued for the AI pipeline. The review card confirms or dismisses the
 * reminders the friend was unsure about and saves facts about the user.
 */
@Injectable()
export class CapturesService {
  private readonly logger = new Logger(CapturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly reminders: RemindersService,
    private readonly companion: CompanionChatService,
    private readonly insightsService: CaptureInsightsService,
    @InjectQueue(QUEUE.AI) private readonly aiQueue: Queue,
  ) {}

  private async findRow(userId: string, id: string): Promise<CaptureDetailRow> {
    const row = await this.prisma.meeting.findFirst({
      where: { id, userId, source: 'capture' },
      include: CAPTURE_DETAIL_INCLUDE,
    });
    if (!row) throw AppException.notFound('Recording');
    return row;
  }

  async list(userId: string, limit: number): Promise<CaptureListItem[]> {
    const rows = await this.prisma.meeting.findMany({
      where: { userId, source: 'capture' },
      include: CAPTURE_LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toCaptureListItem);
  }

  async get(userId: string, id: string): Promise<CaptureDetail> {
    const row = await this.findRow(userId, id);
    return toCaptureDetail(row, row.linkedMeetingId ? [] : await this.eventSuggestions(userId, row));
  }

  /** Calendar meetings around the recording time it may belong to ("Recording matches no event"). */
  private async eventSuggestions(userId: string, row: { startAt: Date; endAt: Date | null }) {
    const from = new Date(row.startAt.getTime() - 30 * 60_000);
    const to = new Date((row.endAt ?? row.startAt).getTime() + 30 * 60_000);
    return this.prisma.meeting.findMany({
      where: {
        userId,
        source: { not: 'capture' },
        status: { notIn: ['cancelled'] },
        startAt: { lt: to },
        OR: [{ endAt: { gt: from } }, { endAt: null, startAt: { gt: new Date(from.getTime() - 30 * 60_000) } }],
      },
      select: { id: true, title: true, startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
      take: 3,
    });
  }

  /** The calendar meeting a recording is linked to (must be the user's own, not another recording). */
  private async eventForLink(userId: string, meetingId: string) {
    const event = await this.prisma.meeting.findFirst({
      where: { id: meetingId, userId, source: { not: 'capture' } },
      select: { id: true, title: true, attendees: true },
    });
    if (!event) throw AppException.notFound('Meeting');
    return event;
  }

  /** Idempotent on `clientId`: the phone's upload queue may call it again after a crash or timeout. */
  async create(userId: string, dto: CreateCaptureDto): Promise<CaptureDetail> {
    if (!this.storage.configured) throw AppException.badRequest('File storage is not configured');
    const existing = await this.prisma.meeting.findUnique({
      where: { userId_clientId: { userId, clientId: dto.clientId } },
      select: { id: true, source: true },
    });
    if (existing) {
      if (existing.source !== 'capture') throw AppException.conflict('This id is already used');
      return this.get(userId, existing.id);
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const startAt = new Date(dto.startedAt);
    const event = dto.meetingId ? await this.eventForLink(userId, dto.meetingId) : null;
    const row = await this.prisma.meeting.create({
      data: {
        userId,
        clientId: dto.clientId,
        source: 'capture',
        platform: 'in_person',
        title: dto.title?.trim() || event?.title || defaultCaptureTitle(startAt, user?.timezone ?? 'Asia/Kolkata'),
        // Attendees from the calendar event: owners for action items and recipients of the follow-up.
        ...(event ? { linkedMeetingId: event.id, attendees: event.attendees as Prisma.InputJsonValue } : {}),
        startAt,
        status: 'uploading',
        autoJoin: false,
        isOrganizer: true,
      },
    });
    this.logger.log({ meetingId: row.id }, 'capture created');
    return this.get(userId, row.id);
  }

  /** Stores one audio part. Re-uploading the same index replaces it (safe to retry). */
  async uploadPart(
    userId: string,
    id: string,
    index: number,
    dto: UploadCapturePartDto,
    file: UploadedPart | undefined,
  ): Promise<{ index: number; partsUploaded: number }> {
    if (!Number.isInteger(index) || index < 0 || index >= MAX_CAPTURE_PARTS) {
      throw AppException.validation([
        { field: 'index', messages: [`index must be between 0 and ${MAX_CAPTURE_PARTS - 1}`] },
      ]);
    }
    if (!file?.buffer) throw AppException.validation([{ field: 'file', messages: ['file is required'] }]);
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, userId, source: 'capture' },
      select: { id: true, status: true },
    });
    if (!meeting) throw AppException.notFound('Recording');
    if (meeting.status !== 'uploading') throw AppException.conflict('This recording has already been sent');

    const upload = validateMeetingUpload(file.originalname, file.buffer, await detectFileType(file.buffer));
    if (upload.kind !== 'audio') throw AppException.badRequest('Only audio can be added to a recording');
    const path = `${userId}/${id}/part-${String(index).padStart(3, '0')}.${upload.ext}`;
    await this.storage.upload(path, file.buffer, upload.mime);

    const part = { index, path, durationMs: Math.min(dto.durationMs, MAX_CAPTURE_MS), bytes: file.size };
    // One statement, so parallel uploads of different parts never lose each other.
    await this.prisma.$executeRaw`
      update public.meetings
         set recording_parts = coalesce(
               (select jsonb_agg(e) from jsonb_array_elements(recording_parts) e where (e->>'index')::int <> ${index}),
               '[]'::jsonb
             ) || jsonb_build_array(${JSON.stringify(part)}::jsonb)
       where id = ${id}::uuid`;
    const after = await this.prisma.meeting.findUnique({ where: { id }, select: { recordingParts: true } });
    return { index, partsUploaded: toRecordingParts(after?.recordingParts).length };
  }

  /** All parts are in: save the details and queue processing. Safe to call again once processing. */
  async finish(userId: string, id: string, dto: FinishCaptureDto): Promise<CaptureDetail> {
    const row = await this.findRow(userId, id);
    if (row.status === 'processing' || row.status === 'completed') return toCaptureDetail(row);
    if (row.status !== 'uploading') throw AppException.conflict('This recording cannot be sent again');

    const present = new Set(toRecordingParts(row.recordingParts).map((p) => p.index));
    const missing = Array.from({ length: dto.partCount }, (_, i) => i).filter((i) => !present.has(i));
    if (missing.length) throw AppException.conflict(`Part ${missing[0]} of the recording is missing`);
    if (dto.durationMs < MIN_CAPTURE_MS) throw AppException.badRequest('The recording is too short to process');

    const durationSeconds = Math.round(dto.durationMs / 1000);
    const bookmarks = (dto.bookmarks ?? [])
      .filter((b) => b.atMs <= dto.durationMs)
      .map((b) => ({ atMs: b.atMs, label: b.label?.trim() || null }));
    await this.prisma.meeting.update({
      where: { id },
      data: {
        ...(dto.title?.trim() ? { title: dto.title.trim() } : {}),
        bookmarks,
        durationSeconds,
        endAt: new Date(row.startAt.getTime() + dto.durationMs),
        status: 'processing',
        failureReason: null,
      },
    });
    await this.enqueue(id);
    this.logger.log({ meetingId: id, parts: dto.partCount, durationSeconds }, 'capture queued');
    return this.get(userId, id);
  }

  /** Rename, or link to / unlink from a calendar meeting. Linking copies the attendees and drafts a follow-up. */
  async update(userId: string, id: string, dto: UpdateCaptureDto): Promise<CaptureDetail> {
    const row = await this.findRow(userId, id);
    const data: Prisma.MeetingUncheckedUpdateInput = {};
    if (dto.title?.trim()) data.title = dto.title.trim();
    if (dto.linkedMeetingId === null) data.linkedMeetingId = null;
    else if (dto.linkedMeetingId) {
      const event = await this.eventForLink(userId, dto.linkedMeetingId);
      data.linkedMeetingId = event.id;
      data.attendees = event.attendees as Prisma.InputJsonValue;
      if (row.title.startsWith('Conversation · ') && !dto.title) data.title = event.title;
    }
    if (Object.keys(data).length) await this.prisma.meeting.update({ where: { id }, data });
    if (dto.linkedMeetingId && row.status === 'completed' && row.report && !toFollowUp(row.report.insights)) {
      await this.draftFollowUp(userId, id);
    }
    return this.get(userId, id);
  }

  /** Drafts the follow-up email for a processed recording that now has attendees. */
  private async draftFollowUp(userId: string, id: string): Promise<void> {
    const row = await this.findRow(userId, id);
    if (!row.report) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    if (!user) return;
    const recipients = toAttendees(row.attendees)
      .filter((a) => a.email && a.email.toLowerCase() !== user.email.toLowerCase())
      .map((a) => ({ name: a.name, email: a.email }));
    const followUp = await this.insightsService.followUp({
      userName: user.name ?? user.email,
      title: row.title,
      attendees: recipients,
      summary: row.report.summary,
      decisions: Array.isArray(row.report.decisions) ? (row.report.decisions as string[]) : [],
      actionItems: row.actionItems.map((a) => ({
        title: a.title,
        assigneeName: a.assigneeName,
        dueAt: a.dueAt?.toISOString() ?? null,
      })),
    });
    if (!followUp) return;
    const raw = (row.report.insights ?? {}) as Record<string, unknown>;
    await this.prisma.meetingReport.update({
      where: { meetingId: id },
      data: { insights: { ...raw, followUp } as unknown as Prisma.InputJsonValue },
    });
  }

  /** The user sent the follow-up from their own email app, or skipped it. */
  async followUpDecision(userId: string, id: string, dto: FollowUpDecisionDto): Promise<CaptureDetail> {
    const row = await this.findRow(userId, id);
    const current = row.report ? toFollowUp(row.report.insights) : null;
    if (!row.report || !current) throw AppException.conflict('There is no follow-up email for this recording');
    const followUp = {
      ...current,
      status: dto.status,
      ...(dto.subject?.trim() ? { subject: dto.subject.trim() } : {}),
      ...(dto.body?.trim() ? { body: dto.body.trim() } : {}),
    };
    const raw = (row.report.insights ?? {}) as Record<string, unknown>;
    await this.prisma.meetingReport.update({
      where: { meetingId: id },
      data: { insights: { ...raw, followUp } },
    });
    return this.get(userId, id);
  }

  /** After a failure the audio is kept: process it again (not when there was no speech). */
  async retry(userId: string, id: string): Promise<CaptureDetail> {
    const row = await this.findRow(userId, id);
    if (row.status !== 'failed') throw AppException.conflict('Only a failed recording can be retried');
    if (row.failureReason === NO_SPEECH_REASON) throw AppException.conflict('There was no speech to process');
    if (!toRecordingParts(row.recordingParts).length) throw AppException.conflict('The audio is no longer available');
    await this.prisma.meeting.update({ where: { id }, data: { status: 'processing', failureReason: null } });
    await this.enqueue(id);
    return this.get(userId, id);
  }

  /** Saves the review card: confirm or dismiss unclear reminders, remember chosen facts. */
  async review(userId: string, id: string, dto: ReviewCaptureDto): Promise<CaptureDetail> {
    const row = await this.findRow(userId, id);
    if (row.status !== 'completed' || !row.report) throw AppException.conflict('This recording is not ready yet');
    const insights: CaptureInsights = toCaptureInsights(row.report.insights) ?? {
      people: [],
      userFacts: [],
      savedFacts: [],
      mood: null,
      energy: null,
      suggestions: [],
    };

    for (const answer of dto.suggestions ?? []) {
      const s = insights.suggestions.find((x) => x.id === answer.id);
      if (!s) throw AppException.validation([{ field: 'suggestions', messages: ['unknown suggestion'] }]);
      if (s.status !== 'open') continue;
      if (answer.action === 'dismiss') {
        s.status = 'dismissed';
        continue;
      }
      const remindAt = answer.remindAt ?? s.remindAt;
      if (!remindAt) {
        throw AppException.validation([{ field: 'suggestions', messages: [`pick a time for "${s.title}"`] }]);
      }
      if (new Date(remindAt).getTime() <= Date.now() + 60_000) {
        throw AppException.validation([
          { field: 'suggestions', messages: [`"${s.title}" needs a time in the future`] },
        ]);
      }
      const title = answer.title?.trim() || s.title;
      const reminder = await this.reminders.createAndSchedule({
        userId,
        meetingId: id,
        type: 'commitment',
        source: 'ai',
        title,
        body: s.body,
        remindAt: new Date(remindAt),
        channels: DEFAULT_REMINDER_CHANNELS,
      });
      Object.assign(s, {
        status: 'confirmed',
        title,
        remindAt: new Date(remindAt).toISOString(),
        reminderId: reminder.id,
      });
    }

    const known = new Map(insights.userFacts.map((f) => [f.toLowerCase(), f]));
    const saved = new Set(insights.savedFacts.map((f) => f.toLowerCase()));
    const toSave = (dto.saveFacts ?? [])
      .map((f) => known.get(f.trim().toLowerCase()))
      .filter((f): f is string => !!f && !saved.has(f.toLowerCase()));
    if (toSave.length) {
      await this.companion.rememberFacts(userId, toSave);
      insights.savedFacts = [...insights.savedFacts, ...toSave];
    }

    await this.prisma.$transaction([
      this.prisma.meetingReport.update({
        where: { meetingId: id },
        // Keep what else is stored next to the insights (the follow-up draft).
        data: {
          insights: {
            ...((row.report.insights ?? {}) as Record<string, unknown>),
            ...insights,
          } as unknown as Prisma.InputJsonValue,
        },
      }),
      this.prisma.meeting.update({ where: { id }, data: { reviewedAt: new Date() } }),
    ]);
    return this.get(userId, id);
  }

  /** "Stop and delete": removes the recording, its audio, transcript, summary, to-dos and reminders. */
  async remove(userId: string, id: string): Promise<void> {
    const row = await this.findRow(userId, id);
    await removeJob(this.aiQueue, JobId.ai(id));
    const paths = toRecordingParts(row.recordingParts).map((p) => p.path);
    if (row.recordingPath) paths.push(row.recordingPath);
    await this.storage.remove(paths);
    // Reminders keep meeting_id on delete (set null); cancel the ones still waiting so nothing fires later.
    await this.reminders.cancelMany(row.reminders.filter((r) => r.status === 'pending'));
    await this.prisma.meeting.delete({ where: { id } });
  }

  private async enqueue(id: string): Promise<void> {
    await upsertJob<AiProcessJob>(
      this.aiQueue,
      JOB.AI_PROCESS,
      { meetingId: id, transcribe: true },
      { jobId: JobId.ai(id) },
      'keep',
    );
  }
}
