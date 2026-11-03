import type {
  ActionItemListQuery,
  AnalyticsRange,
  MeetingListQuery,
  ReminderListQuery,
} from './types';

/** Query-key factory. Prefix keys (e.g. `qk.meetings.all`) invalidate every query below them. */
export const qk = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  analytics: (range: AnalyticsRange) => ['analytics', range] as const,
  integrations: ['integrations'] as const,
  meetings: {
    all: ['meetings'] as const,
    lists: ['meetings', 'list'] as const,
    list: (params: Omit<MeetingListQuery, 'page'>) => ['meetings', 'list', params] as const,
    details: ['meetings', 'detail'] as const,
    detail: (id: string) => ['meetings', 'detail', id] as const,
    transcript: (id: string) => ['meetings', 'transcript', id] as const,
  },
  actionItems: {
    all: ['action-items'] as const,
    list: (params: Omit<ActionItemListQuery, 'page'>) => ['action-items', 'list', params] as const,
  },
  reminders: {
    all: ['reminders'] as const,
    list: (params: Omit<ReminderListQuery, 'page'>) => ['reminders', 'list', params] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (unreadOnly: boolean) => ['notifications', 'list', { unreadOnly }] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
  },
  assistant: {
    threads: ['assistant', 'threads'] as const,
    messages: (threadId: string) => ['assistant', 'messages', threadId] as const,
  },
  public: {
    onboarding: ['public', 'onboarding'] as const,
    loginHero: ['public', 'login-hero'] as const,
    page: (slug: string) => ['public', 'page', slug] as const,
  },
} as const;
