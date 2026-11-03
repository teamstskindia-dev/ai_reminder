import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { patchEntity, removeEntity, restoreSnapshot } from '../cache';
import { qk } from '../queryKeys';
import {
  createMeeting,
  deleteMeeting,
  getMeeting,
  getTranscript,
  listMeetings,
  recallBot,
  reprocessMeeting,
  sendBot,
  updateMeeting,
} from '../resources/meetings';
import type { CreateMeetingInput, MeetingDetail, MeetingScope, MeetingStatus } from '../types';

import { nextPageParam, PAGE_SIZE } from './pagination';

/** Statuses where the bot or the AI pipeline is actively working — poll for changes. */
export const LIVE_STATUSES: readonly MeetingStatus[] = ['joining', 'waiting_room', 'in_progress', 'processing'];

export function isLiveStatus(status: MeetingStatus | undefined): boolean {
  return status !== undefined && LIVE_STATUSES.includes(status);
}

export function useMeetingsInfinite(params: { scope: MeetingScope; q?: string }) {
  const query = { scope: params.scope, q: params.q?.trim() || undefined, limit: PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: qk.meetings.list(query),
    queryFn: ({ pageParam }) => listMeetings({ ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
  });
}

export function useMeeting(id: string | undefined) {
  return useQuery({
    queryKey: qk.meetings.detail(id ?? ''),
    queryFn: () => getMeeting(id as string),
    enabled: Boolean(id),
    refetchInterval: (query) => (isLiveStatus(query.state.data?.status) ? 5_000 : false),
  });
}

export function useTranscript(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.meetings.transcript(id ?? ''),
    queryFn: () => getTranscript(id as string),
    enabled: Boolean(id) && enabled,
    staleTime: 5 * 60_000,
  });
}

function useInvalidateMeetings() {
  const qc = useQueryClient();
  return () =>
    Promise.all([qc.invalidateQueries({ queryKey: qk.meetings.all }), qc.invalidateQueries({ queryKey: qk.dashboard })]);
}

export function useCreateMeeting() {
  const qc = useQueryClient();
  const invalidate = useInvalidateMeetings();
  return useMutation({
    mutationFn: (input: CreateMeetingInput) => createMeeting(input),
    meta: { handlesErrors: true },
    onSuccess: (meeting) => {
      qc.setQueryData(qk.meetings.detail(meeting.id), meeting);
      void invalidate();
    },
  });
}

export function useToggleAutoJoin() {
  const qc = useQueryClient();
  const invalidate = useInvalidateMeetings();
  return useMutation({
    mutationFn: ({ id, autoJoin }: { id: string; autoJoin: boolean }) => updateMeeting(id, { autoJoin }),
    onMutate: ({ id, autoJoin }) => patchEntity(qc, [qk.meetings.all, qk.dashboard], id, { autoJoin }),
    onError: (_error, _vars, snapshot) => restoreSnapshot(qc, snapshot),
    onSettled: () => invalidate(),
  });
}

export function useDeleteMeeting() {
  const qc = useQueryClient();
  const invalidate = useInvalidateMeetings();
  return useMutation({
    mutationFn: (id: string) => deleteMeeting(id),
    onSuccess: async (_data, id) => {
      await removeEntity(qc, [qk.meetings.lists, qk.dashboard], id);
      qc.removeQueries({ queryKey: qk.meetings.detail(id) });
      void invalidate();
    },
  });
}

export function useBotControl(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateMeetings();
  return useMutation({
    mutationFn: (action: 'join' | 'leave') => (action === 'join' ? sendBot(id) : recallBot(id)),
    onSuccess: (meeting: MeetingDetail) => {
      qc.setQueryData(qk.meetings.detail(id), meeting);
      void invalidate();
    },
  });
}

export function useReprocessMeeting(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => reprocessMeeting(id),
    onSuccess: () => {
      qc.setQueryData<MeetingDetail>(qk.meetings.detail(id), (prev) => (prev ? { ...prev, status: 'processing' } : prev));
      void qc.invalidateQueries({ queryKey: qk.meetings.detail(id) });
    },
  });
}
