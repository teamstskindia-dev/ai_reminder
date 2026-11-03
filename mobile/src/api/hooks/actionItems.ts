import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { patchEntity, removeEntity, restoreSnapshot } from '../cache';
import { qk } from '../queryKeys';
import { createActionItem, deleteActionItem, listActionItems, updateActionItem } from '../resources/actionItems';
import type { ActionItem, ActionItemStatus, CreateActionItemInput, UpdateActionItemInput } from '../types';

import { nextPageParam, PAGE_SIZE } from './pagination';

const AFFECTED = [qk.actionItems.all, qk.dashboard, qk.meetings.details] as const;

export function useActionItemsInfinite(status: ActionItemStatus | 'all') {
  const query = { status, limit: PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: qk.actionItems.list(query),
    queryFn: ({ pageParam }) => listActionItems({ ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
  });
}

function useInvalidateActionItems() {
  const qc = useQueryClient();
  return (meetingId?: string | null) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.actionItems.all }),
      qc.invalidateQueries({ queryKey: qk.dashboard }),
      qc.invalidateQueries({ queryKey: qk.reminders.all }),
      meetingId ? qc.invalidateQueries({ queryKey: qk.meetings.detail(meetingId) }) : Promise.resolve(),
    ]);
}

/** Check / uncheck an action item with an optimistic update everywhere it is cached. */
export function useToggleActionItem() {
  const qc = useQueryClient();
  const invalidate = useInvalidateActionItems();
  return useMutation({
    mutationFn: ({ item, done }: { item: ActionItem; done: boolean }) =>
      updateActionItem(item.id, { status: done ? 'done' : 'open' }),
    onMutate: ({ item, done }) =>
      patchEntity(qc, AFFECTED, item.id, {
        status: done ? 'done' : 'open',
        completedAt: done ? new Date().toISOString() : null,
      }),
    onError: (_error, _vars, snapshot) => restoreSnapshot(qc, snapshot),
    onSettled: (_data, _error, { item }) => invalidate(item.meetingId),
  });
}

export function useSaveActionItem() {
  const invalidate = useInvalidateActionItems();
  return useMutation({
    meta: { handlesErrors: true },
    mutationFn: (input: { id?: string; create?: CreateActionItemInput; update?: UpdateActionItemInput }) => {
      if (input.id && input.update) return updateActionItem(input.id, input.update);
      if (input.create) return createActionItem(input.create);
      return Promise.reject(new Error('Nothing to save'));
    },
    onSuccess: (item) => invalidate(item.meetingId),
  });
}

export function useDeleteActionItem() {
  const qc = useQueryClient();
  const invalidate = useInvalidateActionItems();
  return useMutation({
    mutationFn: (item: ActionItem) => deleteActionItem(item.id),
    onMutate: (item) => removeEntity(qc, AFFECTED, item.id),
    onError: (_error, _item, snapshot) => restoreSnapshot(qc, snapshot),
    onSettled: (_data, _error, item) => invalidate(item.meetingId),
  });
}
