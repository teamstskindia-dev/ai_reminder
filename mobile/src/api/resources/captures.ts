import { api } from '../client';
import { uploadMultipart } from '../multipart';
import type { CaptureBookmark, CaptureDetail, CaptureListItem, CaptureReviewInput } from '../types';

/** Recent recorded conversations, newest first. */
export function fetchCaptures(limit = 10): Promise<CaptureListItem[]> {
  return api<CaptureListItem[]>('/captures', { query: { limit } });
}

export function fetchCapture(id: string): Promise<CaptureDetail> {
  return api<CaptureDetail>(`/captures/${id}`);
}

/** Idempotent on clientId: the upload queue may call it again after a crash or timeout. */
export function createCapture(input: {
  clientId: string;
  startedAt: string;
  title?: string;
  /** The calendar meeting this recording belongs to. */
  meetingId?: string;
}): Promise<CaptureDetail> {
  return api<CaptureDetail>('/captures', { method: 'POST', body: input });
}

/** Uploads one recorded part (re-uploading the same index replaces it). */
export function uploadCapturePart(
  id: string,
  index: number,
  part: { uri: string; durationMs: number },
): Promise<{ index: number; partsUploaded: number }> {
  const ext = part.uri.split('.').pop()?.toLowerCase() || 'm4a';
  return uploadMultipart(`/captures/${id}/parts/${index}`, {
    method: 'PUT',
    fields: { durationMs: Math.max(0, Math.round(part.durationMs)) },
    file: { uri: part.uri, name: `part-${index}.${ext}`, type: ext === 'm4a' ? 'audio/mp4' : `audio/${ext}` },
    timeoutMs: 180_000,
  });
}

export function finishCapture(
  id: string,
  input: { partCount: number; durationMs: number; title?: string; bookmarks?: CaptureBookmark[] },
): Promise<CaptureDetail> {
  return api<CaptureDetail>(`/captures/${id}/finish`, { method: 'POST', body: input, timeoutMs: 30_000 });
}

export function renameCapture(id: string, title: string): Promise<CaptureDetail> {
  return api<CaptureDetail>(`/captures/${id}`, { method: 'PATCH', body: { title } });
}

/** Link to a calendar meeting (copies its attendees, drafts a follow-up), or null for standalone. */
export function linkCapture(id: string, linkedMeetingId: string | null): Promise<CaptureDetail> {
  return api<CaptureDetail>(`/captures/${id}`, { method: 'PATCH', body: { linkedMeetingId }, timeoutMs: 45_000 });
}

export function decideFollowUp(
  id: string,
  input: { status: 'sent' | 'skipped'; subject?: string; body?: string },
): Promise<CaptureDetail> {
  return api<CaptureDetail>(`/captures/${id}/follow-up`, { method: 'POST', body: input });
}

export function reviewCapture(id: string, input: CaptureReviewInput): Promise<CaptureDetail> {
  return api<CaptureDetail>(`/captures/${id}/review`, { method: 'POST', body: input, timeoutMs: 30_000 });
}

export function retryCapture(id: string): Promise<CaptureDetail> {
  return api<CaptureDetail>(`/captures/${id}/retry`, { method: 'POST' });
}

export function deleteCapture(id: string): Promise<void> {
  return api<void>(`/captures/${id}`, { method: 'DELETE' });
}
