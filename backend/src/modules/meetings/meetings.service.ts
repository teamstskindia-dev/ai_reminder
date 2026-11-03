import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/pagination/pagination';
import type { MeetingDetail, MeetingListItem, TranscriptSegment } from '../../common/types/api.types';
import { isJoinableMeetUrl } from '../../common/validation/safe-url';
import { removeJob, upsertJob } from '../../infra/queue/job-utils';
import { AiProcessJob, JOB, JobId, QUEUE } from '../../infra/queue/queue.constants';
import { REDIS, RedisKeys } from '../../infra/redis/redis.constants';
import { StorageService } from '../../infra/storage/storage.service';
import { MeetingSchedulerService } from '../bot/meeting-scheduler.service';
import { CreateMeetingDto, ListMeetingsQueryDto, UpdateMeetingDto } from './dto/meetings.dto';
import { MeetingEventsService } from './meeting-events.service';
import { toMeetingDetail, toMeetingListItem, toTranscriptSegment } from './meetings.mapper';
import { LIVE_STATUSES, MeetingsRepository, TranscriptRepository } from './meetings.repository';

const LEAVE_FLAG_TTL_SECONDS = 6 * 3600;

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly meetings: MeetingsRepository,
    private readonly transcripts: TranscriptRepository,
    private readonly events: MeetingEventsService,
    private readonly scheduler: MeetingSchedulerService,
    private readonly storage: StorageService,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(QUEUE.AI) private readonly aiQueue: Queue,
  ) {}

  async list(userId: string, q: ListMeetingsQueryDto): Promise<Paginated<MeetingListItem>> {
    const ascending = q.sort ? q.sort === 'startAt:asc' : q.scope === 'upcoming';
    const { rows, total } = await this.meetings.list({ ...q, userId }, q.page, q.limit, ascending);
    return Paginated.of(rows.map(toMeetingListItem), total, q.page, q.limit);
  }

  async get(userId: string, id: string): Promise<MeetingDetail> {
    return toMeetingDetail(await this.meetings.findDetailForUser(userId, id));
  }

  async transcript(userId: string, id: string): Promise<TranscriptSegment[]> {
    await this.meetings.findForUser(userId, id);
    return (await this.transcripts.listAll(id)).map(toTranscriptSegment);
  }

  async create(userId: string, dto: CreateMeetingDto): Promise<MeetingDetail> {
    const startAt = new Date(dto.startAt);
    const endAt = dto.endAt ? new Date(dto.endAt) : null;
    if (endAt && endAt.getTime() <= startAt.getTime()) {
      throw AppException.validation([{ field: 'endAt', messages: ['endAt must be after startAt'] }]);
    }
    if ((endAt ?? new Date(startAt.getTime() + 3600_000)).getTime() < Date.now()) {
      throw AppException.validation([{ field: 'startAt', messages: ['the meeting is already over'] }]);
    }
    const row = await this.meetings.insert({
      userId,
      source: 'manual',
      title: dto.title.trim(),
      platform: 'google_meet',
      meetingUrl: dto.meetingUrl.trim(),
      startAt,
      endAt,
      isOrganizer: true,
      autoJoin: dto.autoJoin ?? true,
      status: 'scheduled',
    });
    await this.scheduler.scheduleMeeting(row);
    return this.get(userId, row.id);
  }

  async update(userId: string, id: string, dto: UpdateMeetingDto): Promise<MeetingDetail> {
    const current = await this.meetings.findForUser(userId, id);
    const data: { title?: string; autoJoin?: boolean } = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.autoJoin !== undefined) data.autoJoin = dto.autoJoin;
    if (Object.keys(data).length) {
      const updated = await this.meetings.update(id, data);
      if (dto.autoJoin !== undefined && dto.autoJoin !== current.autoJoin)
        await this.scheduler.scheduleMeeting(updated);
      else if (dto.title !== undefined) await this.scheduler.scheduleMeeting(updated);
    }
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const meeting = await this.meetings.findForUser(userId, id);
    if (LIVE_STATUSES.includes(meeting.status)) {
      await this.redis.set(RedisKeys.botLeave(id), '1', 'EX', LEAVE_FLAG_TTL_SECONDS);
    }
    await this.scheduler.unscheduleMeeting(meeting);
    await removeJob(this.aiQueue, JobId.ai(id));
    if (meeting.recordingPath) await this.storage.remove([meeting.recordingPath]);
    await this.meetings.delete(id);
  }

  async joinBot(userId: string, id: string): Promise<MeetingDetail> {
    const meeting = await this.meetings.findForUser(userId, id);
    if (meeting.platform !== 'google_meet' || !isJoinableMeetUrl(meeting.meetingUrl)) {
      throw AppException.badRequest(
        'The bot can only join Google Meet links like https://meet.google.com/abc-defg-hij',
      );
    }
    if (LIVE_STATUSES.includes(meeting.status)) throw AppException.conflict('The bot is already in this meeting');
    if (['processing', 'completed'].includes(meeting.status))
      throw AppException.conflict('This meeting has already been recorded');
    if (meeting.endAt && meeting.endAt.getTime() < Date.now())
      throw AppException.conflict('This meeting has already ended');
    await this.scheduler.joinNow(meeting);
    return this.get(userId, id);
  }

  async leaveBot(userId: string, id: string): Promise<MeetingDetail> {
    const meeting = await this.meetings.findForUser(userId, id);
    if (LIVE_STATUSES.includes(meeting.status)) {
      await this.redis.set(RedisKeys.botLeave(id), '1', 'EX', LEAVE_FLAG_TTL_SECONDS);
    } else if (meeting.status === 'scheduled') {
      await this.scheduler.unscheduleMeeting(meeting);
      await this.meetings.update(id, { autoJoin: false, botJobId: null });
    } else {
      throw AppException.conflict('The bot is not in this meeting');
    }
    return this.get(userId, id);
  }

  async reprocess(userId: string, id: string): Promise<{ queued: true }> {
    const meeting = await this.meetings.findForUser(userId, id);
    return this.enqueueReprocess(meeting);
  }

  /** Shared by the user endpoint and POST /admin/meetings/:id/reprocess. */
  async enqueueReprocess(meeting: {
    id: string;
    status: string;
    recordingPath: string | null;
    userId: string;
  }): Promise<{ queued: true }> {
    if (LIVE_STATUSES.includes(meeting.status)) throw AppException.conflict('The meeting is still being recorded');
    const segments = await this.transcripts.count(meeting.id);
    const transcribe =
      segments === 0 && !!meeting.recordingPath && /\.(mp3|m4a|wav|webm|ogg)$/i.test(meeting.recordingPath);
    if (!segments && !transcribe) throw AppException.conflict('This meeting has no transcript to process');
    await this.events.setStatus(meeting.id, 'processing', { failureReason: null });
    await upsertJob<AiProcessJob>(
      this.aiQueue,
      JOB.AI_PROCESS,
      { meetingId: meeting.id, transcribe },
      { jobId: JobId.ai(meeting.id) },
      'keep',
    );
    this.logger.log({ meetingId: meeting.id, transcribe }, 'reprocess queued');
    return { queued: true };
  }
}
