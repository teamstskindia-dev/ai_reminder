import { api } from "./client";
import type { AppNotification, NotificationListParams } from "./types";

export const notificationsApi = {
  list: (params: NotificationListParams = {}) =>
    api.page<AppNotification>("/notifications", {
      ...params,
      unreadOnly: params.unreadOnly ? true : undefined,
    }),
  unreadCount: () => api.get<{ count: number }>("/notifications/unread-count"),
  markRead: (id: string) => api.patch<AppNotification>(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ updated: number }>("/notifications/read-all"),
};
