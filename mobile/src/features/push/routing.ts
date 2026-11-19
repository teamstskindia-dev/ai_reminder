import { router, type Href } from 'expo-router';

import type { FeatureKey, NotificationData } from '@/api/types';
import { openExternal } from '@/utils/links';
import { safeUrl, type SafeTarget } from '@/utils/safeUrl';
import { toast } from '@/utils/toast';

const NOTIFICATIONS: SafeTarget = { kind: 'internal', path: '/notifications', feature: null };

/**
 * Where a notification (push tap or in-app row) should go, through the link allowlist:
 * a reminder (`data.reminderId`, except "meeting starts soon") → the reminder with Done / Snooze,
 * `data.captureId` (a recorded conversation) → its review card, `data.emailId` → the email summary,
 * `data.meetingId` (UUID) → meeting detail, `data.url` (allowlisted route or https) → that target,
 * otherwise the notifications screen.
 */
export function routeForNotificationData(data: NotificationData | Record<string, unknown> | undefined | null): SafeTarget {
  const reminderId = typeof data?.reminderId === 'string' ? data.reminderId : null;
  if (reminderId && data?.type !== 'meeting_upcoming') {
    const target = safeUrl(`/reminder/${reminderId}`);
    if (target) return target;
  }
  const captureId = typeof data?.captureId === 'string' ? data.captureId : null;
  if (captureId) {
    const target = safeUrl(`/capture/${captureId}`);
    if (target) return target;
  }
  const emailId = typeof data?.emailId === 'string' ? data.emailId : null;
  if (emailId) {
    const target = safeUrl(`/email/${emailId}`);
    if (target) return target;
  }
  const meetingId = typeof data?.meetingId === 'string' ? data.meetingId : null;
  if (meetingId) {
    const target = safeUrl(`/meeting/${meetingId}`);
    if (target) return target;
  }
  const url = typeof data?.url === 'string' ? data.url : null;
  if (url) return safeUrl(url) ?? NOTIFICATIONS;
  return NOTIFICATIONS;
}

/** Opens a notification's target. `fromNotificationsScreen` avoids pushing the list onto itself. */
export function openNotificationTarget(
  data: NotificationData | Record<string, unknown> | undefined | null,
  isEnabled: (feature: FeatureKey) => boolean,
  options: { fromNotificationsScreen?: boolean } = {},
): void {
  const target = routeForNotificationData(data);
  if (target.kind === 'external') {
    void openExternal(target.url);
    return;
  }
  if (target.feature && !isEnabled(target.feature)) {
    toast("This feature isn't available right now.");
    if (!options.fromNotificationsScreen) router.push('/notifications');
    return;
  }
  if (options.fromNotificationsScreen && target.path === '/notifications') return;
  router.push(target.path as Href);
}
