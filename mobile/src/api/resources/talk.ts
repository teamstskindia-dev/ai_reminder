import { api, apiPage } from '../client';
import type { Paginated, TalkMessage, TalkReply, TalkThread } from '../types';

export interface TalkSendInput {
  text: string;
  threadId?: string;
  /** Nothing is saved or learned; the app sends the recent history itself. */
  incognito?: boolean;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export function sendTalk(input: TalkSendInput): Promise<TalkReply> {
  return api<TalkReply>('/talk/messages', { method: 'POST', body: input, timeoutMs: 60_000 });
}

export interface ScheduleInput {
  messageId?: string;
  actionId?: string;
  title: string;
  startAt: string;
  endAt: string;
  attendees: { name?: string | null; email: string }[];
}

/** Creates the approved meeting in Google Calendar (Google sends the invites). */
export function scheduleMeeting(input: ScheduleInput): Promise<{ eventId: string; htmlLink: string | null; message: TalkMessage | null }> {
  return api('/talk/schedule', { method: 'POST', body: input, timeoutMs: 30_000 });
}

export function setTalkActionStatus(input: { messageId: string; actionId: string; status: 'sent' | 'cancelled' }): Promise<TalkMessage> {
  return api<TalkMessage>('/talk/actions/status', { method: 'POST', body: input });
}

/** Sends an approved email from the connected Gmail / Outlook (threaded when it is a reply). */
export function sendTalkEmail(input: {
  messageId?: string;
  actionId?: string;
  to: string;
  subject: string;
  body: string;
  replyToEmailId?: string | null;
}): Promise<{ message: TalkMessage | null }> {
  return api('/talk/actions/email', { method: 'POST', body: input, timeoutMs: 30_000 });
}

/** Sends a prepared task to its tool; after a duplicate warning: merge or create new. */
export function sendTalkTask(input: { messageId: string; actionId: string; mode: 'send' | 'merge' | 'new' }): Promise<TalkMessage> {
  return api<TalkMessage>('/talk/actions/task', { method: 'POST', body: input, timeoutMs: 45_000 });
}

/** Saves an approved note to Notion. */
export function saveTalkNote(input: { messageId: string; actionId: string; title: string; body: string }): Promise<TalkMessage> {
  return api<TalkMessage>('/talk/actions/note', { method: 'POST', body: input, timeoutMs: 30_000 });
}

/** Re-proposes a meeting that waited for Google Calendar, once the user (re)connected it. */
export function retryTalkAction(input: { messageId: string; actionId: string }): Promise<TalkMessage> {
  return api<TalkMessage>('/talk/actions/retry', { method: 'POST', body: input, timeoutMs: 30_000 });
}

export function fetchTalkThreads(page = 1): Promise<Paginated<TalkThread>> {
  return apiPage<TalkThread>('/talk/threads', { query: { page, limit: 30 } });
}

export function fetchTalkMessages(threadId: string): Promise<TalkMessage[]> {
  return api<TalkMessage[]>(`/talk/threads/${threadId}/messages`);
}

export function deleteTalkThread(threadId: string): Promise<void> {
  return api<void>(`/talk/threads/${threadId}`, { method: 'DELETE' });
}
