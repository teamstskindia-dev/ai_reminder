import type {
  ActionItemListQuery,
  AnalyticsRange,
  MeetingListQuery,
  ReminderListQuery,
} from './types';

/** Query-key factory. Prefix keys (e.g. `qk.meetings.all`) invalidate every query below them. */
export const qk = {
  me: ['me'] as const,
  profile: ['me', 'profile'] as const,
  dashboard: ['dashboard'] as const,
  today: ['today'] as const,
  checkin: ['checkin', 'today'] as const,
  mood: (days: number) => ['checkin', 'mood', days] as const,
  nudge: (id: string) => ['nudge', id] as const,
  recaps: ['recaps'] as const,
  moodInsights: ['checkin', 'mood', 'insights'] as const,
  memory: {
    all: ['memory'] as const,
    timeline: ['memory', 'timeline'] as const,
    search: (q: string) => ['memory', 'search', q] as const,
    people: (q: string) => ['memory', 'people', q] as const,
    person: (id: string) => ['memory', 'person', id] as const,
    corrections: ['memory', 'corrections'] as const,
  },
  dataExport: ['me', 'export'] as const,
  analytics: (range: AnalyticsRange) => ['analytics', range] as const,
  integrations: ['integrations'] as const,
  toolTargets: (provider: string) => ['integrations', 'targets', provider] as const,
  emails: {
    all: ['emails'] as const,
    list: (filter: string) => ['emails', 'list', filter] as const,
    detail: (id: string) => ['emails', 'detail', id] as const,
  },
  toolTasks: {
    all: ['tool-tasks'] as const,
    forItem: (actionItemId: string) => ['tool-tasks', actionItemId] as const,
  },
  meetings: {
    all: ['meetings'] as const,
    lists: ['meetings', 'list'] as const,
    list: (params: Omit<MeetingListQuery, 'page'>) => ['meetings', 'list', params] as const,
    details: ['meetings', 'detail'] as const,
    detail: (id: string) => ['meetings', 'detail', id] as const,
    transcript: (id: string) => ['meetings', 'transcript', id] as const,
  },
  talk: {
    threads: ['talk', 'threads'] as const,
    messages: (threadId: string) => ['talk', 'messages', threadId] as const,
  },
  prep: (meetingId: string) => ['meetings', 'prep', meetingId] as const,
  captures: {
    all: ['captures'] as const,
    list: ['captures', 'list'] as const,
    detail: (id: string) => ['captures', 'detail', id] as const,
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
