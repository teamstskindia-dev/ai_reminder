"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { actionItemsApi } from "@/lib/api/action-items";
import type {
  ActionItem,
  ActionItemListParams,
  CreateActionItemInput,
  DashboardHome,
  MeetingDetail,
  Paginated,
  UpdateActionItemInput,
} from "@/lib/api/types";
import { qk } from "@/lib/query-keys";

export function useActionItems(params: ActionItemListParams) {
  return useQuery({
    queryKey: qk.actionItems.list(params),
    queryFn: () => actionItemsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

function patchActionItemInCache(queryClient: QueryClient, id: string, patch: Partial<ActionItem>) {
  const apply = (item: ActionItem) => (item.id === id ? { ...item, ...patch } : item);
  queryClient.setQueriesData<Paginated<ActionItem>>({ queryKey: qk.actionItems.all }, (prev) =>
    prev?.items ? { ...prev, items: prev.items.map(apply) } : prev,
  );
  queryClient.setQueryData<DashboardHome>(qk.dashboard, (prev) =>
    prev ? { ...prev, openActionItems: prev.openActionItems.map(apply) } : prev,
  );
  queryClient.setQueriesData<MeetingDetail>({ queryKey: qk.meetings.details() }, (prev) =>
    prev?.actionItems ? { ...prev, actionItems: prev.actionItems.map(apply) } : prev,
  );
}

function invalidateActionItems(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: qk.actionItems.all });
  void queryClient.invalidateQueries({ queryKey: qk.dashboard });
  void queryClient.invalidateQueries({ queryKey: qk.meetings.details() });
}

export function useCreateActionItem(options: { silent?: boolean } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silent: options.silent },
    mutationFn: (input: CreateActionItemInput) => actionItemsApi.create(input),
    onSuccess: (_item, input) => {
      invalidateActionItems(queryClient);
      if (input.remind) void queryClient.invalidateQueries({ queryKey: qk.reminders.all });
    },
  });
}

/** Optimistic update (check-off, due date, priority…) across every cache that shows the item. */
export function useUpdateActionItem(options: { silent?: boolean } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silent: options.silent },
    mutationFn: ({ id, input }: { id: string; input: UpdateActionItemInput }) => actionItemsApi.update(id, input),
    onMutate: async ({ id, input }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: qk.actionItems.all }),
        queryClient.cancelQueries({ queryKey: qk.dashboard }),
        queryClient.cancelQueries({ queryKey: qk.meetings.details() }),
      ]);
      const snapshots = [
        ...queryClient.getQueriesData({ queryKey: qk.actionItems.all }),
        ...queryClient.getQueriesData({ queryKey: qk.dashboard }),
        ...queryClient.getQueriesData({ queryKey: qk.meetings.details() }),
      ];
      const patch: Partial<ActionItem> = { ...input } as Partial<ActionItem>;
      if (input.status === "done") patch.completedAt = new Date().toISOString();
      if (input.status === "open") patch.completedAt = null;
      patchActionItemInCache(queryClient, id, patch);
      return { snapshots };
    },
    onError: (_error, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => invalidateActionItems(queryClient),
  });
}

export function useDeleteActionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => actionItemsApi.remove(id),
    onSuccess: () => invalidateActionItems(queryClient),
  });
}
