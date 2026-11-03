import { api, upload, type UploadOptions } from "./client";
import type {
  CreateMeetingInput,
  MeetingDetail,
  MeetingListItem,
  MeetingListParams,
  TranscriptSegment,
  UpdateMeetingInput,
} from "./types";

export interface UploadMeetingInput {
  file: File;
  title: string;
  startAt?: string;
}

export const meetingsApi = {
  list: (params: MeetingListParams = {}) => api.page<MeetingListItem>("/meetings", { ...params }),
  get: (id: string) => api.get<MeetingDetail>(`/meetings/${id}`),
  transcript: (id: string) => api.get<TranscriptSegment[]>(`/meetings/${id}/transcript`),
  create: (input: CreateMeetingInput) => api.post<MeetingDetail>("/meetings", input),
  update: (id: string, input: UpdateMeetingInput) => api.patch<MeetingDetail>(`/meetings/${id}`, input),
  remove: (id: string) => api.delete(`/meetings/${id}`),
  botJoin: (id: string) => api.post<MeetingDetail>(`/meetings/${id}/bot/join`),
  botLeave: (id: string) => api.post<MeetingDetail>(`/meetings/${id}/bot/leave`),
  reprocess: (id: string) => api.post<{ queued: true }>(`/meetings/${id}/reprocess`),
  upload: (input: UploadMeetingInput, opts?: UploadOptions) => {
    const form = new FormData();
    form.append("file", input.file);
    form.append("title", input.title);
    if (input.startAt) form.append("startAt", input.startAt);
    return upload<MeetingDetail>("/meetings/upload", form, opts);
  },
};
