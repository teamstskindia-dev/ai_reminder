import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { useUnreadCount } from '@/api/hooks/notifications';
import { qk } from '@/api/queryKeys';
import { markNotificationOpened } from '@/api/resources/notifications';
import { completeReminder, snoozeReminder } from '@/api/resources/reminders';
import type { FeatureKey } from '@/api/types';
import { logger, reportError } from '@/utils/logger';
import { toast } from '@/utils/toast';

import { ReminderAction } from './handler';
import { registerForPushNotifications } from './registration';
import { openNotificationTarget } from './routing';

/** Done / Snooze tapped on a reminder notification. Returns false for a plain tap. */
async function runReminderAction(response: Notifications.NotificationResponse): Promise<boolean> {
  const { actionIdentifier } = response;
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const reminderId = typeof data?.reminderId === 'string' ? data.reminderId : null;
  const known = Object.values(ReminderAction) as string[];
  if (!reminderId || !known.includes(actionIdentifier)) return false;
  void Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined);
  try {
    if (actionIdentifier === ReminderAction.done) {
      await completeReminder(reminderId);
      toast('Nice one! Marked done.');
    } else {
      const minutes = actionIdentifier === ReminderAction.snooze15 ? 15 : 60;
      await snoozeReminder(reminderId, minutes);
      toast(minutes === 15 ? "Okay, I'll remind you in 15 minutes." : "Okay, I'll remind you in an hour.");
    }
  } catch (error) {
    toast(getErrorMessage(error, "Couldn't update that reminder."));
  }
  return true;
}

/** Registers this device for push after sign-in when the feature and the user's setting allow it. */
export function usePushRegistration(options: { enabled: boolean; brandColor: string }) {
  const { enabled, brandColor } = options;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    registerForPushNotifications({ brandColor, prompt: true })
      .then((result) => {
        if (!cancelled) logger.debug('Push registration finished', { status: result.status });
      })
      // Never blocks the app: push is best effort.
      .catch((error: unknown) => reportError(error, { source: 'push-registration' }));
    return () => {
      cancelled = true;
    };
  }, [enabled, brandColor]);
}

/**
 * Deep-links notification taps (including the one that cold-started the app) and refreshes
 * in-app data when a notification arrives in the foreground.
 */
export function useNotificationRouting(options: { signedIn: boolean; isEnabled: (feature: FeatureKey) => boolean }) {
  const { signedIn, isEnabled } = options;
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const qc = useQueryClient();

  useEffect(() => {
    if (!signedIn || !navigationReady) return;

    const open = (response: Notifications.NotificationResponse) => {
      // Teaches the friend which times of day the user answers pushes (user-flow §09). Best effort.
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      if (typeof data?.notificationId === 'string') {
        markNotificationOpened(data.notificationId)
          .then(() => qc.invalidateQueries({ queryKey: qk.notifications.all }))
          .catch(() => undefined);
      }
      void runReminderAction(response).then((handled) => {
        if (handled) {
          void qc.invalidateQueries({ queryKey: qk.reminders.all });
          void qc.invalidateQueries({ queryKey: qk.today });
          void qc.invalidateQueries({ queryKey: qk.dashboard });
          return;
        }
        openNotificationTarget(response.notification.request.content.data, isEnabled);
      });
    };

    const initial = Notifications.getLastNotificationResponse();
    if (initial) {
      Notifications.clearLastNotificationResponse();
      // Let the first screen settle before stacking the target on top of it.
      setTimeout(() => open(initial), 50);
    }
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      Notifications.clearLastNotificationResponse();
      open(response);
    });
    const receiveSub = Notifications.addNotificationReceivedListener(() => {
      void qc.invalidateQueries({ queryKey: qk.notifications.all });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: qk.today });
      void qc.invalidateQueries({ queryKey: qk.reminders.all });
    });
    return () => {
      tapSub.remove();
      receiveSub.remove();
    };
  }, [signedIn, navigationReady, isEnabled, qc]);
}

/** iOS app-icon badge mirrors the unread notification count (cleared on read-all and sign-out). */
export function useAppBadge(signedIn: boolean) {
  const unread = useUnreadCount(signedIn);
  const count = signedIn ? (unread.data ?? 0) : 0;
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    Notifications.setBadgeCountAsync(count).catch(() => undefined);
  }, [count]);
}
