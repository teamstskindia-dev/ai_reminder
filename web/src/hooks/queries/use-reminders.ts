"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { remindersApi } from "@/lib/api/reminders";
import type {
  CreateReminderInput,
  DashboardHome,
  Paginated,
  Reminder,
  ReminderListParams,
  UpdateReminderInput,
} from "@/lib/api/types";
import { qk } from "@/lib/query-keys";

export function useReminders(params: ReminderListParams) {
  return useQuery({
    queryKey: qk.reminders.list(params),
    queryFn: () => remindersApi.list(params),
    placeholderData: keepPreviousData,
  });
}

function invalidateReminders(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: qk.reminders.all });
  void queryClient.invalidateQueries({ queryKey: qk.dashboard });
}

function patchReminderInCache(queryClient: QueryClient, id: string, patch: Partial<Reminder>) {
  const apply = (r: Reminder) => (r.id === id ? { ...r, ...patch } : r);
  queryClient.setQueriesData<Paginated<Reminder>>({ queryKey: qk.reminders.all }, (prev) =>
    prev?.items ? { ...prev, items: prev.items.map(apply) } : prev,
  );
  queryClient.setQueryData<DashboardHome>(qk.dashboard, (prev) =>
    prev ? { ...prev, upcomingReminders: prev.upcomingReminders.map(apply) } : prev,
  );
}

export function useCreateReminder(options: { silent?: boolean } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silent: options.silent },
    mutationFn: (input: CreateReminderInput) => remindersApi.create(input),
    onSuccess: () => invalidateReminders(queryClient),
  });
}

export function useUpdateReminder(options: { silent?: boolean } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silent: options.silent },
    mutationFn: ({ id, input }: { id: string; input: UpdateReminderInput }) => remindersApi.update(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: qk.reminders.all });
      const snapshots = [
        ...queryClient.getQueriesData({ queryKey: qk.reminders.all }),
        ...queryClient.getQueriesData({ queryKey: qk.dashboard }),
      ];
      patchReminderInCache(queryClient, id, input as Partial<Reminder>);
      return { snapshots };
    },
    onError: (_error, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => invalidateReminders(queryClient),
  });
}

export function useSnoozeReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) => remindersApi.snooze(id, minutes),
    onSuccess: (reminder) => patchReminderInCache(queryClient, reminder.id, reminder),
    onSettled: () => invalidateReminders(queryClient),
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => remindersApi.remove(id),
    onSuccess: () => invalidateReminders(queryClient),
  });
}
