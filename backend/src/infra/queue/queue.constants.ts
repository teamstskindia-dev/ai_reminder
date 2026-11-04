import type { DefaultJobOptions } from 'bullmq';

export const QUEUE = {
  CALENDAR_SYNC: 'calendar-sync',
  MEETING_BOT: 'meeting-bot',
  AI: 'ai-processing',
  NOTIFICATIONS: 'notifications',
  DIGEST: 'digest',
  /** Recall.ai webhook events (status changes, bot done → transcript import); consumed by the worker. */
  BOT_EVENTS: 'bot-events',
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
} as const;

/** Custom job ids (BullMQ forbids ':' in custom ids). */
export const JobId = {
  sync: (userId: string) => `sync-${userId}`,
  bot: (meetingId: string) => `bot-${meetingId}`,
  ai: (meetingId: string) => `ai-${meetingId}`,
  reminder: (reminderId: string) => `reminder-${reminderId}`,
  digest: (yyyyMMddHH: string) => `digest-${yyyyMMddHH}`,
  broadcast: (broadcastId: string) => `broadcast-${broadcastId}`,
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
export interface BroadcastJob {
  broadcastId: string;
}
