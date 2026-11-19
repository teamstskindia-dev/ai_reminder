import type { NotificationPriority, NotificationType } from '../../common/types/api.types';
import { addDays, atLocalTime, dayKey, inQuietHours, localMinutes } from '../companion/rhythm.util';

/**
 * How notifications decide (user-flow §09): one rulebook for every push so the friend feels thoughtful,
 * not spammy. Pure functions; DeliveryService applies the decision.
 *
 * - critical (timed reminders, meeting starting, urgent email): pushed now, or held until quiet hours /
 *   focus mode end unless the user lets them break through (VIP senders always may);
 * - normal (capture ready, task created, check-ins …): pushed now; in quiet hours or beyond the daily push
 *   budget they are bundled into one push later;
 * - low (insights, FYI emails): never pushed, they go into the brief or the digest.
 */
export const PRIORITY: Record<NotificationType, NotificationPriority> = {
  reminder: 'critical',
  action_item_due: 'critical',
  meeting_upcoming: 'critical',
  meeting_start: 'critical',
  email_important: 'critical',
  reminder_followup: 'normal',
  report_ready: 'normal',
  capture_ready: 'normal',
  bot_failed: 'normal',
  morning_brief: 'normal',
  evening_checkin: 'normal',
  companion_nudge: 'normal',
  weekly_recap: 'normal',
  meeting_notes: 'normal',
  task_created: 'normal',
  reconnect_needed: 'normal',
  email_bundle: 'normal',
  push_bundle: 'normal',
  broadcast: 'normal',
  welcome: 'normal',
  daily_digest: 'low',
};

/** Pushes the user scheduled themselves (or bundles) never use up the daily budget. */
export const BUDGET_EXEMPT = new Set<NotificationType>([
  'morning_brief',
  'evening_checkin',
  'weekly_recap',
  'push_bundle',
  'email_bundle',
]);

export interface QuietSettings {
  quietHoursStart: string;
  quietHoursEnd: string;
  focusUntil: Date | null;
}

export interface PolicySettings extends QuietSettings {
  pushBudget: number;
  criticalBreakThrough: boolean;
}

export type PushDecision =
  | { action: 'send' }
  /** Low priority: in-app, brief and digest only. */
  | { action: 'none' }
  /** Critical: delivered when quiet hours / focus mode end. */
  | { action: 'hold'; until: Date }
  /** Normal: counted into one bundle push at `releaseAt`. */
  | { action: 'bundle'; releaseAt: Date; reason: 'quiet' | 'budget' };

/** When the current quiet hours (or focus mode) end, or null when the user can be pinged now. */
export function quietUntil(now: Date, tz: string, s: QuietSettings): Date | null {
  const focus = s.focusUntil && s.focusUntil.getTime() > now.getTime() ? s.focusUntil : null;
  let quietEnd: Date | null = null;
  if (inQuietHours(localMinutes(now, tz), s.quietHoursStart, s.quietHoursEnd)) {
    const day = dayKey(now, tz);
    quietEnd = atLocalTime(day, tz, s.quietHoursEnd);
    if (quietEnd.getTime() <= now.getTime()) quietEnd = atLocalTime(addDays(day, 1), tz, s.quietHoursEnd);
  }
  if (focus && quietEnd) return focus.getTime() > quietEnd.getTime() ? focus : quietEnd;
  return focus ?? quietEnd;
}

/** Start of the next hour: when pushes held back by the daily budget go out as one. */
export function nextHour(now: Date): Date {
  const d = new Date(now.getTime());
  d.setUTCMinutes(0, 0, 0);
  return new Date(d.getTime() + 3600_000);
}

export function decidePush(input: {
  priority: NotificationPriority;
  type: NotificationType;
  now: Date;
  timezone: string;
  settings: PolicySettings;
  /** Normal pushes already sent today (local day). */
  sentToday: number;
  /** This one may break through quiet hours anyway (e.g. an email from a VIP sender). */
  breakThrough?: boolean;
}): PushDecision {
  const { priority, type, now, settings } = input;
  if (priority === 'low') return { action: 'none' };
  const quiet = quietUntil(now, input.timezone, settings);
  if (priority === 'critical') {
    if (quiet && !(settings.criticalBreakThrough || input.breakThrough)) return { action: 'hold', until: quiet };
    return { action: 'send' };
  }
  if (quiet) return { action: 'bundle', releaseAt: quiet, reason: 'quiet' };
  if (!BUDGET_EXEMPT.has(type) && input.sentToday >= Math.max(1, settings.pushBudget)) {
    return { action: 'bundle', releaseAt: nextHour(now), reason: 'budget' };
  }
  return { action: 'send' };
}

export function countsAgainstBudget(priority: NotificationPriority, type: NotificationType): boolean {
  return priority === 'normal' && !BUDGET_EXEMPT.has(type);
}

/** "Take a break": the friend's own nudges (brief, check-in, proactive nudges, follow-ups) are paused. */
export function nudgesPaused(s: { nudgesPausedUntil: Date | null }, now = new Date()): boolean {
  return Boolean(s.nudgesPausedUntil && s.nudgesPausedUntil.getTime() > now.getTime());
}

// ---------- learning which times work ----------
export type Engagement = Record<string, [number, number]>;

export function toEngagement(raw: unknown): Engagement {
  const out: Engagement = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [hour, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^([01]?\d|2[0-3])$/.test(hour) || !Array.isArray(v)) continue;
    const sent = Number(v[0]);
    const opened = Number(v[1]);
    if (Number.isFinite(sent) && Number.isFinite(opened)) out[String(Number(hour))] = [sent, Math.min(opened, sent)];
  }
  return out;
}

/** Laplace-smoothed open rate of pushes sent at a local hour. */
function openRate([sent, opened]: [number, number]): number {
  return (opened + 1) / (sent + 2);
}

/**
 * The local hour (within `from`..`to`) the user answers pushes at most, once there is enough data
 * (at least `minSamples` pushes at that hour). Null means "no opinion yet".
 * E.g. 9 am nudges always ignored, 11 am ones answered → 11.
 */
export function bestHour(engagement: Engagement, from = 9, to = 20, minSamples = 3): number | null {
  let best: { hour: number; rate: number } | null = null;
  for (let hour = from; hour <= to; hour++) {
    const e = engagement[String(hour)];
    if (!e || e[0] < minSamples) continue;
    const rate = openRate(e);
    if (!best || rate > best.rate) best = { hour, rate };
  }
  return best?.hour ?? null;
}

/** True when pushes at `hour` are mostly ignored (enough data, open rate under 20%). */
export function ignoredHour(engagement: Engagement, hour: number, minSamples = 3): boolean {
  const e = engagement[String(hour)];
  return Boolean(e && e[0] >= minSamples && openRate(e) < 0.2);
}
