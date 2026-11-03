"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { UploadOptions } from "@/lib/api/client";
import { meetingsApi, type UploadMeetingInput } from "@/lib/api/meetings";
import type {
  CreateMeetingInput,
  DashboardHome,
  MeetingDetail,
  MeetingListItem,
  MeetingListParams,
  Paginated,
  UpdateMeetingInput,
} from "@/lib/api/types";
import { qk } from "@/lib/query-keys";

export function useMeetings(params: MeetingListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.meetings.list(params),
    queryFn: () => meetingsApi.list(params),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useMeeting(id: string | undefined) {
  return useQuery({
    queryKey: qk.meetings.detail(id ?? ""),
    queryFn: () => meetingsApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useTranscript(id: string | undefined, enabled = true, refetchInterval: number | false = false) {
  return useQuery({
    queryKey: qk.meetings.transcript(id ?? ""),
    queryFn: () => meetingsApi.transcript(id as string),
    enabled: Boolean(id) && enabled,
    refetchInterval,
  });
}

/** Debounced global search uses this; only runs for 2+ characters. */
export function useMeetingSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: qk.meetings.search(term),
    queryFn: () => meetingsApi.list({ q: term, scope: "all", limit: 8 }),
    enabled: term.length >= 2,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** Patch a meeting everywhere it is cached (lists, detail, dashboard). */
export function patchMeetingInCache(
  queryClient: QueryClient,
  id: string,
  patch: Partial<Pick<MeetingListItem, "title" | "autoJoin" | "status">>,
) {
  queryClient.setQueriesData<Paginated<MeetingListItem>>({ queryKey: qk.meetings.lists() }, (prev) =>
    prev ? { ...prev, items: prev.items.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : prev,
  );
  queryClient.setQueryData<MeetingDetail>(qk.meetings.detail(id), (prev) => (prev ? { ...prev, ...patch } : prev));
  queryClient.setQueryData<DashboardHome>(qk.dashboard, (prev) =>
    prev
      ? {
          ...prev,
          upcomingMeetings: prev.upcomingMeetings.map((m) => (m.id === id ? { ...m, ...patch } : m)),
          recentReports: prev.recentReports.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        }
      : prev,
  );
}

function invalidateMeetings(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: qk.meetings.all });
  void queryClient.invalidateQueries({ queryKey: qk.dashboard });
}

export function useCreateMeeting(options: { silent?: boolean } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silent: options.silent },
    mutationFn: (input: CreateMeetingInput) => meetingsApi.create(input),
    onSuccess: (meeting) => {
      queryClient.setQueryData(qk.meetings.detail(meeting.id), meeting);
      invalidateMeetings(queryClient);
    },
  });
}

export function useUpdateMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMeetingInput }) => meetingsApi.update(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: qk.meetings.all });
      const snapshot = queryClient.getQueriesData({ queryKey: qk.meetings.all });
      const dashboard = queryClient.getQueryData(qk.dashboard);
      patchMeetingInCache(queryClient, id, input);
      return { snapshot, dashboard };
    },
    onError: (_error, _vars, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
      if (context?.dashboard) queryClient.setQueryData(qk.dashboard, context.dashboard);
    },
    onSuccess: (meeting) => {
      queryClient.setQueryData(qk.meetings.detail(meeting.id), meeting);
    },
    onSettled: () => invalidateMeetings(queryClient),
  });
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => meetingsApi.remove(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: qk.meetings.detail(id) });
      invalidateMeetings(queryClient);
      void queryClient.invalidateQueries({ queryKey: qk.actionItems.all });
    },
  });
}

export function useBotJoin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => meetingsApi.botJoin(id),
    onSuccess: (meeting) => {
      queryClient.setQueryData(qk.meetings.detail(meeting.id), meeting);
      patchMeetingInCache(queryClient, meeting.id, { status: meeting.status });
      invalidateMeetings(queryClient);
    },
  });
}

export function useBotLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => meetingsApi.botLeave(id),
    onSuccess: (meeting) => {
      queryClient.setQueryData(qk.meetings.detail(meeting.id), meeting);
      patchMeetingInCache(queryClient, meeting.id, { status: meeting.status });
      invalidateMeetings(queryClient);
    },
  });
}

export function useReprocessMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => meetingsApi.reprocess(id),
    onSuccess: (_data, id) => {
      patchMeetingInCache(queryClient, id, { status: "processing" });
      invalidateMeetings(queryClient);
    },
  });
}

export function useUploadMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silent: true }, // the upload dialog shows errors inline
    mutationFn: ({ input, options }: { input: UploadMeetingInput; options?: UploadOptions }) =>
      meetingsApi.upload(input, options),
    onSuccess: (meeting) => {
      queryClient.setQueryData(qk.meetings.detail(meeting.id), meeting);
      invalidateMeetings(queryClient);
    },
  });
}
