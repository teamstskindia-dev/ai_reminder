import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { BaseProcessor, PermanentJobError } from '../../infra/queue/base.processor';
import { JOB, MeetingPromptJob, NudgeJob, QUEUE, RhythmJob } from '../../infra/queue/queue.constants';
import { CheckinService } from './checkin.service';
import { MeetingPromptsService } from './meeting-prompts.service';
import { MorningBriefService } from './morning-brief.service';
import { NightlyService } from './nightly.service';
import { NudgeService } from './nudge.service';
import { RecapService } from './recap.service';
import { RhythmService } from './rhythm.service';
import { weekStartOf } from './rhythm.util';

type CompanionJobData = RhythmJob | NudgeJob | MeetingPromptJob | Record<string, never>;

/** `companion` queue: the 5-minute rhythm tick and the per-user daily-rhythm jobs it fans out. */
@Processor(QUEUE.COMPANION, { concurrency: 4 })
export class CompanionProcessor extends BaseProcessor<CompanionJobData> {
  constructor(
    private readonly rhythm: RhythmService,
    private readonly morning: MorningBriefService,
    private readonly checkins: CheckinService,
    private readonly nightly: NightlyService,
    private readonly recaps: RecapService,
    private readonly nudges: NudgeService,
    private readonly meetingPrompts: MeetingPromptsService,
  ) {
    super();
  }

  protected async handle(job: Job<CompanionJobData>): Promise<unknown> {
    const data = job.data as RhythmJob;
    switch (job.name) {
      case JOB.RHYTHM_TICK:
        return this.rhythm.tick();
      case JOB.MORNING_BRIEF:
        return { outcome: await this.morning.send(data.userId, data.day) };
      case JOB.EVENING_CHECKIN:
        return { outcome: await this.checkins.prompt(data.userId, data.day) };
      case JOB.NIGHTLY:
        return this.nightly.run(data.userId, data.day);
      case JOB.WEEKLY_RECAP:
        return { outcome: await this.recaps.send(data.userId, weekStartOf(data.day)) };
      case JOB.NUDGE:
        return { outcome: await this.nudges.dispatch((job.data as NudgeJob).nudgeId) };
      case JOB.MEETING_START: {
        const d = job.data as MeetingPromptJob;
        return { outcome: await this.meetingPrompts.start(d.meetingId, d.at) };
      }
      case JOB.MEETING_NOTES: {
        const d = job.data as MeetingPromptJob;
        return { outcome: await this.meetingPrompts.notes(d.meetingId, d.at) };
      }
      default:
        throw new PermanentJobError(`Unknown companion job "${job.name}"`);
    }
  }
}
