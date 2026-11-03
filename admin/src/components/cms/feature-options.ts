import type { Features } from '@/lib/api/types';

export const FEATURE_KEYS = [
  'askAi',
  'analytics',
  'reminders',
  'actionItems',
  'calendarSync',
  'meetingUpload',
  'pushNotifications',
  'signupsEnabled',
] as const satisfies readonly (keyof Features)[];

export const FEATURE_LABELS: Record<keyof Features, string> = {
  askAi: 'Ask AI',
  analytics: 'Analytics',
  reminders: 'Reminders',
  actionItems: 'Action items',
  calendarSync: 'Calendar sync',
  meetingUpload: 'Meeting upload',
  pushNotifications: 'Push notifications',
  signupsEnabled: 'Signups enabled',
};
