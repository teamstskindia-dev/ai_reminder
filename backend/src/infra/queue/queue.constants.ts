import type { DefaultJobOptions } from 'bullmq';

export const QUEUE = {
  CALENDAR_SYNC: 'calendar-sync',
  MEETING_BOT: 'meeting-bot',
  AI: 'ai-processing',
  NOTIFICATIONS: 'notifications',
  DIGEST: 'digest',
  /** Recall.ai webhook events (status changes, bot done → transcript import); consumed by the worker. */
  BOT_EVENTS: 'bot-events',
  /** Daily rhythm (user-flow §03): morning brief, evening check-in, night learning, nudges, weekly recap. */
  COMPANION: 'companion',
} as const;
export type QueueNameValue = (typeof QUEUE)[keyof typeof QUEUE];

export const JOB = {
  SYNC_ALL: 'sync-all',
  SYNC_USER: 'sync-user',
  BOT_JOIN: 'join',
  AI_PROCESS: 'process',
  REMINDER: 'reminder',
  NOTIFY: 'notify',
  BROADCAST: 'broadcast',
  DIGEST_TICK: 'tick',
  DIGEST_RUN: 'run',
  RECALL_EVENT: 'recall-event',
  REMINDER_FOLLOWUP: 'reminder-followup',
  RHYTHM_TICK: 'rhythm-tick',
  MORNING_BRIEF: 'morning-brief',
  EVENING_CHECKIN: 'evening-checkin',
  NIGHTLY: 'nightly',
  WEEKLY_RECAP: 'weekly-recap',
  NUDGE: 'nudge',
  /** "Meeting starting: record it?" at the event start (user-flow §06). */
  MEETING_START: 'meeting-start',
  /** "Add quick notes?" after an event that was not recorded. */
  MEETING_NOTES: 'meeting-notes',
} as const;

/** Custom job ids (BullMQ forbids ':' in custom ids). */
export const JobId = {
  sync: (userId: string) => `sync-${userId}`,
  bot: (meetingId: string) => `bot-${meetingId}`,
  ai: (meetingId: string) => `ai-${meetingId}`,
  reminder: (reminderId: string) => `reminder-${reminderId}`,
  digest: (yyyyMMddHH: string) => `digest-${yyyyMMddHH}`,
  broadcast: (broadcastId: string) => `broadcast-${broadcastId}`,
  followUp: (reminderId: string, sentAtMs: number) => `followup-${reminderId}-${sentAtMs}`,
  /** One per user and local day (or week start for the recap): `morning-brief-<user>-2026-11-14`. */
  rhythm: (kind: string, userId: string, day: string) => `${kind}-${userId}-${day}`,
  nudge: (nudgeId: string) => `nudge-${nudgeId}`,
  meetingStart: (meetingId: string) => `meeting-start-${meetingId}`,
  meetingNotes: (meetingId: string) => `meeting-notes-${meetingId}`,
  /** One job per webhook delivery id: Recall.ai retries reuse the id, so duplicates are dropped by BullMQ. */
  recallEvent: (webhookId: string) => `recall-${webhookId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100)}`,
};

const SEVEN_DAYS = 7 * 24 * 3600;
const base: DefaultJobOptions = { removeOnComplete: 1000, removeOnFail: { age: SEVEN_DAYS } };

export const QUEUE_DEFAULTS: Record<QueueNameValue, DefaultJobOptions> = {
  [QUEUE.CALENDAR_SYNC]: { ...base, attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
  [QUEUE.MEETING_BOT]: { ...base, attempts: 1 },
  [QUEUE.AI]: { ...base, attempts: 5, backoff: { type: 'exponential', delay: 60_000 } },
  [QUEUE.NOTIFICATIONS]: { ...base, attempts: 3, backoff: { type: 'exponential', delay: 10_000 } },
  [QUEUE.DIGEST]: { ...base, attempts: 2, backoff: { type: 'exponential', delay: 60_000 } },
  // A finished call's transcript can take minutes to be ready: 8 attempts ≈ one hour of backoff.
  [QUEUE.BOT_EVENTS]: { ...base, attempts: 8, backoff: { type: 'exponential', delay: 30_000 } },
  [QUEUE.COMPANION]: { ...base, attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
};

// ---- job payloads ----
export interface SyncUserJob {
  userId: string;
  reason?: string;
}
export interface BotJoinJob {
  meetingId: string;
}
export interface AiProcessJob {
  meetingId: string;
  transcribe?: boolean;
}
export interface ReminderJob {
  reminderId: string;
  remindAt: string;
}
export interface NotifyJob {
  userId: string;
  type: string;
  templateKey: string;
  vars: Record<string, string | number | null>;
  data?: Record<string, unknown>;
  channels?: string[];
}
export interface RecallEventJob {
  /** Recall.ai bot UUID. */
  botId: string;
  /** e.g. bot.in_call_recording, bot.done, bot.fatal, transcript.done. */
  event: string;
  subCode: string | null;
  /** When Recall.ai recorded the status change (ISO), if given. */
  updatedAt: string | null;
}
export interface ReminderFollowUpJob {
  reminderId: string;
  /** sentAt (ISO) of the delivery this follows up on; a snoozed / re-sent reminder makes the job stale. */
  sentAt: string;
}
/** Per-user daily-rhythm job; `day` is the user's local date (YYYY-MM-DD). */
export interface RhythmJob {
  userId: string;
  day: string;
}
export interface NudgeJob {
  nudgeId: string;
}
/** `at` (ISO) is the start / end time it was scheduled for: a rescheduled meeting makes the job stale. */
export interface MeetingPromptJob {
  meetingId: string;
  at: string;
}
export interface BroadcastJob {
  broadcastId: string;
}
