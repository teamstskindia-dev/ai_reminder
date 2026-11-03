import type {
  ActionItemListParams,
  AnalyticsRange,
  MeetingListParams,
  NotificationListParams,
  ReminderListParams,
} from "@/lib/api/types";

/**
 * One query-key factory for the whole app. Every key starts with the resource name so a
 * whole resource can be invalidated with `queryClient.invalidateQueries({ queryKey: qk.meetings.all })`.
 */
export const qk = {
  session: ["session"] as const,
  settings: ["settings"] as const,
  integrations: ["integrations"] as const,
  devices: ["devices"] as const,
  dashboard: ["dashboard"] as const,
  analytics: (range: AnalyticsRange) => ["analytics", range] as const,
  meetings: {
    all: ["meetings"] as const,
    lists: () => ["meetings", "list"] as const,
    list: (params: MeetingListParams) => ["meetings", "list", params] as const,
    details: () => ["meetings", "detail"] as const,
    detail: (id: string) => ["meetings", "detail", id] as const,
    transcript: (id: string) => ["meetings", "transcript", id] as const,
    search: (q: string) => ["meetings", "search", q] as const,
  },
  actionItems: {
    all: ["action-items"] as const,
    list: (params: ActionItemListParams) => ["action-items", "list", params] as const,
  },
  reminders: {
    all: ["reminders"] as const,
    list: (params: ReminderListParams) => ["reminders", "list", params] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: (params: NotificationListParams) => ["notifications", "list", params] as const,
    unreadCount: ["notifications", "unread-count"] as const,
  },
  assistant: {
    all: ["assistant"] as const,
    threads: ["assistant", "threads"] as const,
    messages: (threadId: string) => ["assistant", "messages", threadId] as const,
  },
};
