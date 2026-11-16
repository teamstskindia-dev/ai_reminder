import { api } from '../client';
import type { CheckinReply, CompanionNudge, DailyCheckin, MoodPoint, NudgeReply, TodayBrief, WeeklyRecap } from '../types';

/** The Today screen: greeting, one-line brief, today's meetings, reminders, open items, check-in, nudge. */
export function fetchToday(): Promise<TodayBrief> {
  return api<TodayBrief>('/today');
}

/** Today's evening check-in (started with the friend's opening message on first call). */
export function fetchCheckinToday(): Promise<DailyCheckin> {
  return api<DailyCheckin>('/checkins/today');
}

export function replyCheckin(text: string): Promise<CheckinReply> {
  return api<CheckinReply>('/checkins/today/reply', { method: 'POST', body: { text }, timeoutMs: 60_000 });
}

export function finishCheckin(): Promise<CheckinReply> {
  return api<CheckinReply>('/checkins/today/finish', { method: 'POST', timeoutMs: 60_000 });
}

export function fetchMood(days = 30): Promise<MoodPoint[]> {
  return api<MoodPoint[]>('/checkins/mood', { query: { days } });
}

export function fetchNudge(id: string): Promise<CompanionNudge> {
  return api<CompanionNudge>(`/nudges/${id}`);
}

export function replyNudge(id: string, text: string): Promise<NudgeReply> {
  return api<NudgeReply>(`/nudges/${id}/reply`, { method: 'POST', body: { text }, timeoutMs: 60_000 });
}

export function dismissNudge(id: string): Promise<void> {
  return api<void>(`/nudges/${id}/dismiss`, { method: 'POST' });
}

export function fetchRecaps(limit = 4): Promise<WeeklyRecap[]> {
  return api<WeeklyRecap[]>('/recaps', { query: { limit } });
}
