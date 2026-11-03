import AsyncStorage from '@react-native-async-storage/async-storage';

export const StorageKeys = {
  config: 'remi.config.v1',
  onboardingSeen: 'remi.onboardingSeen.v1',
  dismissedBanners: 'remi.dismissedBanners.v1',
  pushToken: 'remi.pushToken.v1',
  pushPrompted: 'remi.pushPrompted.v1',
} as const;

/** Removes per-user cached data (push token, dismissed banners) on sign-out / account deletion. */
export async function clearUserScopedStorage(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([StorageKeys.pushToken, StorageKeys.dismissedBanners, StorageKeys.pushPrompted]);
  } catch {
    // Non-fatal: these keys hold no credentials.
  }
}

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a cache here; failures are non-fatal.
  }
}

