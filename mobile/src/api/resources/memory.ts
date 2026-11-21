import { api } from '../client';
import type {
  DataExportStatus,
  MemorySearch,
  MemoryTimeline,
  MoodInsights,
  NameCorrection,
  NameFixResult,
  PersonDetail,
  PersonListItem,
  ProfilePatch,
  UserProfile,
} from '../types';

/** Memory, You and privacy (user-flow §10). */

export function fetchTimeline(before?: string): Promise<MemoryTimeline> {
  return api<MemoryTimeline>('/memory/timeline', { query: before ? { before } : undefined });
}

export function searchMemory(q: string): Promise<MemorySearch> {
  return api<MemorySearch>('/memory/search', { query: { q }, timeoutMs: 30_000 });
}

export function listPeople(q?: string): Promise<PersonListItem[]> {
  return api<PersonListItem[]>('/memory/people', { query: q ? { q } : undefined });
}

export function fetchPerson(id: string): Promise<PersonDetail> {
  return api<PersonDetail>(`/memory/people/${id}`);
}

export function createPerson(body: { name: string; relationship?: string | null; facts?: string[] }): Promise<PersonDetail> {
  return api<PersonDetail>('/memory/people', { method: 'POST', body });
}

export function updatePerson(
  id: string,
  body: { name?: string; relationship?: string | null; facts?: string[] },
): Promise<PersonDetail> {
  return api<PersonDetail>(`/memory/people/${id}`, { method: 'PATCH', body, timeoutMs: 45_000 });
}

export function deletePerson(id: string): Promise<void> {
  return api<void>(`/memory/people/${id}`, { method: 'DELETE' });
}

/** Fixes a speaker or a misheard name (everywhere for real names, remembered for next time). */
export function fixName(conversationId: string, body: { from: string; to: string; onlyHere?: boolean }): Promise<NameFixResult> {
  return api<NameFixResult>(`/memory/conversations/${conversationId}/fix-name`, { method: 'POST', body, timeoutMs: 60_000 });
}

export function updateSummary(conversationId: string, summary: string): Promise<{ summary: string }> {
  return api<{ summary: string }>(`/memory/conversations/${conversationId}/summary`, { method: 'PATCH', body: { summary } });
}

export function updateTranscriptLine(conversationId: string, seq: number, text: string): Promise<{ seq: number; text: string }> {
  return api<{ seq: number; text: string }>(`/memory/conversations/${conversationId}/transcript/${seq}`, {
    method: 'PATCH',
    body: { text },
  });
}

export function fetchCorrections(): Promise<NameCorrection[]> {
  return api<NameCorrection[]>('/memory/corrections');
}

export function removeCorrection(from: string): Promise<NameCorrection[]> {
  return api<NameCorrection[]>('/memory/corrections', { method: 'DELETE', query: { from } });
}

export function fetchMoodInsights(): Promise<MoodInsights> {
  return api<MoodInsights>('/checkins/mood/insights');
}

export function updateProfile(patch: ProfilePatch): Promise<UserProfile> {
  return api<UserProfile>('/me/profile', { method: 'PATCH', body: patch });
}

export function fetchExportStatus(): Promise<DataExportStatus> {
  return api<DataExportStatus>('/me/export');
}

export function requestExport(): Promise<DataExportStatus> {
  return api<DataExportStatus>('/me/export', { method: 'POST' });
}
