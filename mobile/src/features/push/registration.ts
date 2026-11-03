import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import {
  AndroidImportance,
  AndroidNotificationVisibility,
  IosAuthorizationStatus,
  type NotificationPermissionsStatus,
} from 'expo-notifications';
import { Platform } from 'react-native';

import { registerDevice, unregisterDevice } from '@/api/resources/devices';
import { getAppVersion, getEasProjectId, IS_EXPO_GO } from '@/utils/env';
import { logger, reportError } from '@/utils/logger';
import { StorageKeys } from '@/utils/storage';

export const DEFAULT_CHANNEL_ID = 'default';

export type PushRegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'denied' }
  | { status: 'skipped'; reason: string };

export async function ensureAndroidChannel(color: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'Meetings & reminders',
    description: 'Meeting start alerts, due action items and your reminders',
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: color,
    lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    showBadge: true,
  });
}

/** Authorized, or iOS "provisional" (delivered quietly to Notification Center) — both can receive pushes. */
function isAllowed(permissions: NotificationPermissionsStatus): boolean {
  return permissions.granted || permissions.ios?.status === IosAuthorizationStatus.PROVISIONAL;
}

/**
 * Requests permission (if allowed to prompt), obtains the Expo push token and upserts it via
 * POST /devices. Every non-fatal problem resolves to `skipped` with a dev log instead of throwing.
 */
export async function registerForPushNotifications(options: {
  brandColor: string;
  prompt: boolean;
}): Promise<PushRegistrationResult> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return { status: 'skipped', reason: 'unsupported platform' };

  try {
    await ensureAndroidChannel(options.brandColor);
  } catch (error) {
    reportError(error, { source: 'push-channel' });
  }

  const current = await Notifications.getPermissionsAsync();
  let granted = isAllowed(current);
  if (!granted && current.canAskAgain && options.prompt) {
    granted = isAllowed(
      await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } }),
    );
  }
  // Denied is a valid user choice: the app keeps working with in-app notifications.
  if (!granted) return { status: 'denied' };

  if (IS_EXPO_GO && Platform.OS === 'android') {
    logger.debug('Push skipped: remote notifications are unavailable in Expo Go on Android (SDK 53+). Use a development build.');
    return { status: 'skipped', reason: 'expo-go' };
  }

  const projectId = getEasProjectId();
  if (!projectId) {
    logger.debug('Push skipped: no EAS projectId configured (set EAS_PROJECT_ID).');
    return { status: 'skipped', reason: 'no-project-id' };
  }

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (error) {
    logger.debug(
      Device.isDevice
        ? 'Push skipped: no Expo push token (is FCM/APNs configured for this build?)'
        : 'Push skipped: no Expo push token on this emulator/simulator (needs Google Play services / a real device)',
      { reason: error instanceof Error ? error.message : String(error) },
    );
    return { status: 'skipped', reason: 'token-unavailable' };
  }

  await registerDevice({
    expoPushToken: token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    deviceName: Device.deviceName ?? Device.modelName ?? undefined,
    appVersion: getAppVersion(),
  });
  await AsyncStorage.setItem(StorageKeys.pushToken, token).catch(() => undefined);
  return { status: 'registered', token };
}

/** Removes this device's push token from the backend (best effort) — used on sign out. */
export async function unregisterPushToken(): Promise<void> {
  const token = await AsyncStorage.getItem(StorageKeys.pushToken).catch(() => null);
  if (!token) return;
  try {
    await unregisterDevice(token);
  } catch (error) {
    logger.debug('Push: failed to unregister the device token', { reason: String(error) });
  }
  await AsyncStorage.removeItem(StorageKeys.pushToken).catch(() => undefined);
}

/** Drops the locally stored token without calling the API (account already deleted). */
export async function forgetPushToken(): Promise<void> {
  await AsyncStorage.removeItem(StorageKeys.pushToken).catch(() => undefined);
}
