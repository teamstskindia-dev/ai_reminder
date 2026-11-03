import { api, apiPage } from '../client';
import type {
  AppNotification,
  PageQuery,
} from '../types';

export function listNotifications(query: PageQuery & { unreadOnly?: boolean }) {
  return apiPage<AppNotification>('/notifications', { query: { ...query } });
}

export function fetchUnreadCount(): Promise<{ count: number }> {
  return api<{ count: number }>('/notifications/unread-count');
}

export function markNotificationRead(id: string): Promise<AppNotification> {
  return api<AppNotification>(`/notifications/${id}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return api<{ updated: number }>('/notifications/read-all', { method: 'POST' });
}
