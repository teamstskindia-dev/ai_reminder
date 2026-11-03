import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useUnreadCount } from '@/api/hooks/notifications';
import { qk } from '@/api/queryKeys';
import type { FeatureKey } from '@/api/types';
import { logger, reportError } from '@/utils/logger';

import { registerForPushNotifications } from './registration';
import { openNotificationTarget } from './routing';

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
      openNotificationTarget(response.notification.request.content.data, isEnabled);
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
