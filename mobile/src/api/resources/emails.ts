import { api, apiPage } from '../client';
import type { EmailDetail, EmailFilter, EmailItem, EmailReplyDraft, PageQuery } from '../types';

export function listEmails(query: PageQuery & { filter?: EmailFilter }) {
  return apiPage<EmailItem>('/emails', { query: { ...query } });
}

export function fetchEmail(id: string): Promise<EmailDetail> {
  return api<EmailDetail>(`/emails/${id}`);
}

export function syncEmails(): Promise<{ queued: true }> {
  return api<{ queued: true }>('/emails/sync', { method: 'POST' });
}

export function emailFeedback(id: string, kind: 'not_important' | 'always_alert'): Promise<EmailDetail> {
  return api<EmailDetail>(`/emails/${id}/feedback`, { method: 'POST', body: { kind } });
}

export function setEmailStatus(id: string, status: 'done' | 'new'): Promise<EmailDetail> {
  return api<EmailDetail>(`/emails/${id}/status`, { method: 'POST', body: { status } });
}

export function remindAboutEmail(id: string, remindAt: string, title?: string): Promise<EmailDetail> {
  return api<EmailDetail>(`/emails/${id}/remind`, { method: 'POST', body: { remindAt, title } });
}

export function resolveDetected(
  id: string,
  detectedId: string,
  action: 'reminder' | 'calendar' | 'dismiss',
  remindAt?: string,
): Promise<EmailDetail> {
  return api<EmailDetail>(`/emails/${id}/detected/${detectedId}`, { method: 'POST', body: { action, remindAt } });
}

export function draftEmailReply(id: string, instructions?: string): Promise<EmailReplyDraft> {
  return api<EmailReplyDraft>(`/emails/${id}/reply-draft`, { method: 'POST', body: { instructions }, timeoutMs: 60_000 });
}

export function sendEmailReply(id: string, draft: { to: string; subject: string; body: string }): Promise<EmailDetail> {
  return api<EmailDetail>(`/emails/${id}/reply`, { method: 'POST', body: draft, timeoutMs: 30_000 });
}
