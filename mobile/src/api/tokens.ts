import * as SecureStore from 'expo-secure-store';

import { createEmitter } from '@/utils/emitter';
import { reportError } from '@/utils/logger';

import type { AuthTokens } from './types';

const ACCESS_KEY = 'remi.accessToken';
const REFRESH_KEY = 'remi.refreshToken';

interface TokenState {
  accessToken: string | null;
  refreshToken: string | null;
}

let cache: TokenState | null = null;
let loading: Promise<TokenState> | null = null;

/** Emits whenever tokens are stored or cleared (e.g. so the realtime socket can reconnect). */
export const tokenEvents = createEmitter<TokenState>();

const EMPTY: TokenState = { accessToken: null, refreshToken: null };
const READ_TIMEOUT_MS = 5_000;

/** Reads tokens at boot. Fails closed (signed out) on errors or a stuck keychain read, never blocking launch. */
async function readFromStore(): Promise<TokenState> {
  try {
    const read = Promise.all([SecureStore.getItemAsync(ACCESS_KEY), SecureStore.getItemAsync(REFRESH_KEY)]);
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), READ_TIMEOUT_MS));
    const result = await Promise.race([read, timeout]);
    if (!result) {
      reportError(new Error('Secure storage read timed out'), { source: 'secure-store-read' });
      return EMPTY;
    }
    const [accessToken, refreshToken] = result;
    return { accessToken, refreshToken };
  } catch (error) {
    reportError(error, { source: 'secure-store-read' });
    return EMPTY;
  }
}

export async function loadTokens(): Promise<TokenState> {
  if (cache) return cache;
  if (!loading) {
    loading = readFromStore().then((state) => {
      cache = state;
      loading = null;
      return state;
    });
  }
  return loading;
}

export async function getAccessToken(): Promise<string | null> {
  return (await loadTokens()).accessToken;
}

export async function getRefreshToken(): Promise<string | null> {
  return (await loadTokens()).refreshToken;
}

export async function setTokens(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): Promise<void> {
  cache = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  tokenEvents.emit(cache);
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  cache = { accessToken: null, refreshToken: null };
  tokenEvents.emit(cache);
  await Promise.all([SecureStore.deleteItemAsync(ACCESS_KEY), SecureStore.deleteItemAsync(REFRESH_KEY)]);
}
