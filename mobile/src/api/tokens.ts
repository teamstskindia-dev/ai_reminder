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

const TIMED_OUT = Symbol('timed-out');

function readBoth(): Promise<[string | null, string | null]> {
  return Promise.all([SecureStore.getItemAsync(ACCESS_KEY), SecureStore.getItemAsync(REFRESH_KEY)]);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Reads tokens at boot. A slow keystore (old hardware, memory pressure, cold start) gets one retry pass
 * before we conclude it is empty, so a slow read is not mistaken for "signed out". Still fails closed
 * (signed out) on errors or a keychain read stuck through both passes, never blocking launch forever.
 */
async function readFromStore(): Promise<TokenState> {
  try {
    const first = readBoth();
    let result = await withTimeout(first, READ_TIMEOUT_MS);
    if (result === TIMED_OUT) {
      // Retry pass: a fresh read, while still accepting the first read if it finishes first.
      result = await withTimeout(Promise.race([first, readBoth()]), READ_TIMEOUT_MS);
    }
    if (result === TIMED_OUT) {
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
