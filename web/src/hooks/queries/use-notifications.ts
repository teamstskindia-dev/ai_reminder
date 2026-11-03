"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/lib/api/notifications";
import type { AppNotification, NotificationListParams, Paginated } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";

export function useNotifications(params: NotificationListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.notifications.list(params),
    queryFn: () => notificationsApi.list(params),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: qk.notifications.unreadCount,
    queryFn: () => notificationsApi.unreadCount(),
    // Realtime keeps this fresh; polling is only a safety net.
    refetchInterval: 120_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: qk.notifications.all });
      const snapshots = queryClient.getQueriesData({ queryKey: qk.notifications.all });
      const now = new Date().toISOString();
      let wasUnread = false;
      queryClient.setQueriesData<Paginated<AppNotification>>(
        { queryKey: [...qk.notifications.all, "list"] },
        (prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((n) => {
                  if (n.id !== id) return n;
                  if (!n.readAt) wasUnread = true;
                  return { ...n, readAt: n.readAt ?? now };
                }),
              }
            : prev,
      );
      if (wasUnread) {
        queryClient.setQueryData<{ count: number }>(qk.notifications.unreadCount, (prev) =>
          prev ? { count: Math.max(0, prev.count - 1) } : prev,
        );
      }
      return { snapshots };
    },
    onError: (_error, _id, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: qk.notifications.all });
      const snapshots = queryClient.getQueriesData({ queryKey: qk.notifications.all });
      const now = new Date().toISOString();
      queryClient.setQueriesData<Paginated<AppNotification>>(
        { queryKey: [...qk.notifications.all, "list"] },
        (prev) => (prev ? { ...prev, items: prev.items.map((n) => ({ ...n, readAt: n.readAt ?? now })) } : prev),
      );
      queryClient.setQueryData(qk.notifications.unreadCount, { count: 0 });
      return { snapshots };
    },
    onError: (_error, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications.all });
    },
  });
}
