import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { patchEntity, restoreSnapshot } from '../cache';
import { qk } from '../queryKeys';
import {
  fetchUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../resources/notifications';
import type { AppNotification, Paginated } from '../types';

import { nextPageParam, PAGE_SIZE } from './pagination';

export function useNotificationsInfinite(unreadOnly: boolean) {
  return useInfiniteQuery({
    queryKey: qk.notifications.list(unreadOnly),
    queryFn: ({ pageParam }) => listNotifications({ unreadOnly: unreadOnly || undefined, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
  });
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: qk.notifications.unreadCount,
    queryFn: fetchUnreadCount,
    enabled,
    select: (data) => data.count,
    staleTime: 15_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notification: AppNotification) => markNotificationRead(notification.id),
    onMutate: async (notification) => {
      const snapshot = await patchEntity(qc, [qk.notifications.all], notification.id, { readAt: new Date().toISOString() });
      qc.setQueryData<{ count: number }>(qk.notifications.unreadCount, (prev) =>
        prev ? { count: Math.max(0, prev.count - (notification.readAt ? 0 : 1)) } : prev,
      );
      return snapshot;
    },
    onError: (_error, _vars, snapshot) => restoreSnapshot(qc, snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: qk.notifications.all });
      const now = new Date().toISOString();
      qc.setQueriesData<InfiniteData<Paginated<AppNotification>>>({ queryKey: [...qk.notifications.all, 'list'] }, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.map((n) => (n.readAt ? n : { ...n, readAt: now })),
              })),
            }
          : data,
      );
      qc.setQueryData(qk.notifications.unreadCount, { count: 0 });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications.all }),
  });
}
