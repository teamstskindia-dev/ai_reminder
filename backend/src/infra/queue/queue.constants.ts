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
  /** Connected apps (user-flow §07, §08): email polling and triage, task creation retries and status watching. */
  INTEGRATIONS: 'integrations',
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
  /** Daily housekeeping on the digest queue (prunes expired auth sessions). */
  CLEANUP: 'cleanup',
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
  /** Critical push held in quiet hours / focus mode, delivered when they end (user-flow §09). */
  HELD_PUSH: 'held-push',
  /** One push for the normal notifications held back by quiet hours or the daily push budget. */
  PUSH_BUNDLE: 'push-bundle',
  /** Every few minutes: one EMAIL_SYNC per connected inbox (user-flow §07). */
  EMAIL_POLL: 'email-poll',
  EMAIL_SYNC: 'email-sync',
  /** Important emails beyond the hourly cap, batched into one push. */
  EMAIL_BUNDLE: 'email-bundle',
  /** Every 15 minutes: status and due dates of open tasks in Notion / Jira / Linear / Todoist (§08). */
  TOOLS_WATCH: 'tools-watch',
  /** A task the tool could not take (down, rate limited): retried with backoff. */
  TOOL_TASK_RETRY: 'tool-task-retry',
  /** Privacy (§10): build the user's data export and email the download link. */
  DATA_EXPORT: 'data-export',
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
  heldPush: (notificationId: string) => `held-push-${notificationId}`,
  /** One bundle per user and release time (end of quiet hours, or the next hour for the push budget). */
  pushBundle: (userId: string, releaseAtMs: number) => `push-bundle-${userId}-${releaseAtMs}`,
  emailSync: (accountId: string) => `email-sync-${accountId}`,
  emailBundle: (userId: string, hourKey: string) => `email-bundle-${userId}-${hourKey}`,
  toolTaskRetry: (taskId: string, attempt: number) => `tool-task-${taskId}-${attempt}`,
  dataExport: (userId: string, requestedAtMs: number) => `data-export-${userId}-${requestedAtMs}`,
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
  [QUEUE.INTEGRATIONS]: { ...base, attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
};

// ---- job payloads ----
export interface DataExportJob {
  userId: string;
}
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
/** A critical push held by quiet hours / focus mode (the in-app row, if any, was written already). */
export interface HeldPushJob {
  userId: string;
  notificationId: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  categoryId?: string;
}
export interface PushBundleJob {
  userId: string;
  /** Redis counter holding how many pushes were held back. */
  counterKey: string;
}
export interface EmailSyncJob {
  accountId: string;
}
export interface EmailBundleJob {
  userId: string;
  hourKey: string;
}
export interface ToolTaskRetryJob {
  taskId: string;
}
