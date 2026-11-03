import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Backend origin, e.g. http://localhost:4000 (clients append /api/v1 themselves). */
export const API_ORIGIN = trimTrailingSlash(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000');

export const API_BASE_URL = `${API_ORIGIN}/api/v1`;

/** True when running inside the Expo Go client (no custom native code, no remote push on Android). */
export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * The installed app version. In Expo Go the native version is Expo Go's own, so we fall back to the
 * version from the app config there (and whenever the native value is unavailable).
 */
export function getAppVersion(): string {
  const configVersion = Constants.expoConfig?.version ?? '0.0.0';
  if (IS_EXPO_GO) return configVersion;
  return Application.nativeApplicationVersion ?? configVersion;
}

export function getBuildNumber(): string | null {
  if (IS_EXPO_GO) return null;
  return Application.nativeBuildVersion ?? null;
}

/** EAS project id used for Expo push tokens (from app.config.ts `extra.eas.projectId` or EAS metadata). */
export function getEasProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const fromExtra = extra?.eas?.projectId;
  if (typeof fromExtra === 'string' && fromExtra.length > 0) return fromExtra;
  const fromEas = Constants.easConfig?.projectId;
  return typeof fromEas === 'string' && fromEas.length > 0 ? fromEas : undefined;
}
