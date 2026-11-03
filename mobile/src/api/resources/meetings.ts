import { api, apiPage } from '../client';
import type {
  CreateMeetingInput,
  MeetingDetail,
  MeetingListItem,
  MeetingListQuery,
  TranscriptSegment,
  UpdateMeetingInput,
} from '../types';

export function listMeetings(query: MeetingListQuery) {
  return apiPage<MeetingListItem>('/meetings', { query: { ...query } });
}

export function getMeeting(id: string): Promise<MeetingDetail> {
  return api<MeetingDetail>(`/meetings/${id}`);
}

export function getTranscript(id: string): Promise<TranscriptSegment[]> {
  return api<TranscriptSegment[]>(`/meetings/${id}/transcript`);
}

export function createMeeting(input: CreateMeetingInput): Promise<MeetingDetail> {
  return api<MeetingDetail>('/meetings', { method: 'POST', body: input });
}

export function updateMeeting(id: string, input: UpdateMeetingInput): Promise<MeetingDetail> {
  return api<MeetingDetail>(`/meetings/${id}`, { method: 'PATCH', body: input });
}

export function deleteMeeting(id: string): Promise<void> {
  return api<void>(`/meetings/${id}`, { method: 'DELETE' });
}

export function sendBot(id: string): Promise<MeetingDetail> {
  return api<MeetingDetail>(`/meetings/${id}/bot/join`, { method: 'POST' });
}

export function recallBot(id: string): Promise<MeetingDetail> {
  return api<MeetingDetail>(`/meetings/${id}/bot/leave`, { method: 'POST' });
}

export function reprocessMeeting(id: string): Promise<{ queued: true }> {
  return api<{ queued: true }>(`/meetings/${id}/reprocess`, { method: 'POST' });
}
