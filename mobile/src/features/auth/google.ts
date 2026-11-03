import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { getErrorMessage, isApiError } from '@/api/errors';
import { exchangeCode } from '@/api/resources/auth';
import type { ExchangeResult } from '@/api/types';
import { API_BASE_URL } from '@/utils/env';
import { logger, reportError } from '@/utils/logger';

import { createPkcePair } from './pkce';

export type OAuthErrorCode = 'access_denied' | 'account_suspended' | 'signups_disabled' | 'oauth_failed';

/** Thrown when a callback arrives that this app instance did not start (or whose verifier expired). */
export class NoPendingSignInError extends Error {
  constructor() {
    super('No sign-in in progress');
    this.name = 'NoPendingSignInError';
  }
}

export function signInErrorMessage(code: string, branding?: { appName?: string; supportEmail?: string }): string {
  const supportEmail = branding?.supportEmail;
  switch (code) {
    case 'access_denied':
      return `Google sign-in was cancelled. ${branding?.appName || 'The app'} needs access to your Google account to continue.`;
    case 'account_suspended':
      return supportEmail
        ? `This account has been suspended. Contact ${supportEmail} if you think this is a mistake.`
        : 'This account has been suspended. Please contact support.';
    case 'signups_disabled':
      return 'New sign-ups are paused right now. Please try again later.';
    case 'oauth_failed':
      return "We couldn't complete Google sign-in. Please try again.";
    case 'no_pending':
      return 'Please try signing in again.';
    case 'exchange_failed':
      return 'Your sign-in link expired or was already used. Please try again.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

/** Copy for an exception thrown while completing sign-in (exchange, network, missing verifier). */
export function signInFailureMessage(error: unknown): string {
  if (error instanceof NoPendingSignInError) return signInErrorMessage('no_pending');
  if (isApiError(error) && (error.isNetwork || error.isServerError || error.code === 'UPSTREAM_ERROR' || error.code === 'RATE_LIMITED')) {
    return getErrorMessage(error);
  }
  return signInErrorMessage('exchange_failed');
}

/** Deep link the backend redirects to after Google consent (remi://auth/callback, or exp://… in Expo Go). */
export function getAuthRedirectUri(): string {
  return Linking.createURL('auth/callback');
}

export function parseAuthResultUrl(url: string): { code: string | null; error: string | null } {
  try {
    const { queryParams } = Linking.parse(url);
    const pick = (key: string) => {
      const value = queryParams?.[key];
      const first = Array.isArray(value) ? value[0] : value;
      return typeof first === 'string' && first.length > 0 && first.length < 2048 ? first : null;
    };
    return { code: pick('code'), error: pick('error') };
  } catch {
    return { code: null, error: 'oauth_failed' };
  }
}

// ---------- PKCE attempt (memory only; never persisted or logged) ----------
const ATTEMPT_TTL_MS = 10 * 60_000;
let pendingAttempt: { verifier: string; startedAt: number } | null = null;

function takeVerifier(): string | null {
  const attempt = pendingAttempt;
  pendingAttempt = null;
  if (!attempt || Date.now() - attempt.startedAt > ATTEMPT_TTL_MS) return null;
  return attempt.verifier;
}

export function hasPendingSignIn(): boolean {
  return pendingAttempt !== null && Date.now() - pendingAttempt.startedAt <= ATTEMPT_TTL_MS;
}

export function cancelPendingSignIn(): void {
  pendingAttempt = null;
}

// The code can arrive twice (auth-session result AND the router deep link): exchange it once.
const exchanges = new Map<string, Promise<ExchangeResult>>();

export function isExchangeInFlight(code: string): boolean {
  return exchanges.has(code);
}

/**
 * Exchanges a one-time code with the verifier of the attempt this app started (contract §3, mobile PKCE).
 * Rejects with NoPendingSignInError for callbacks we did not initiate — never exchanges without a verifier.
 */
export function exchangeWithPkce(code: string): Promise<ExchangeResult> {
  const existing = exchanges.get(code);
  if (existing) return existing;
  const codeVerifier = takeVerifier();
  if (!codeVerifier) {
    logger.debug('Ignoring an auth callback this app did not start');
    return Promise.reject(new NoPendingSignInError());
  }
  const pending = exchangeCode(code, codeVerifier);
  exchanges.set(code, pending);
  pending.then(
    // Keep briefly so a duplicate delivery joins the same exchange, then drop the tokens from memory.
    () => setTimeout(() => exchanges.delete(code), 30_000),
    (error: unknown) => {
      exchanges.delete(code);
      reportError(error, { source: 'auth-exchange' });
    },
  );
  return pending;
}

export type BrowserSignInResult =
  | { type: 'code'; code: string }
  | { type: 'error'; error: string }
  | { type: 'cancelled' };

/**
 * Opens Google consent (ASWebAuthenticationSession on iOS, Custom Tabs on Android) and waits for the
 * redirect. Starts a new PKCE attempt each time; the verifier stays in memory only.
 */
export async function openGoogleSignIn(): Promise<BrowserSignInResult> {
  const redirectUri = getAuthRedirectUri();
  const { verifier, challenge } = await createPkcePair();
  pendingAttempt = { verifier, startedAt: Date.now() };
  const url =
    `${API_BASE_URL}/auth/google?platform=mobile` +
    `&redirectUri=${encodeURIComponent(redirectUri)}&codeChallenge=${encodeURIComponent(challenge)}`;

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(url, redirectUri);
  } catch (error) {
    cancelPendingSignIn();
    reportError(error, { source: 'auth-session' });
    return { type: 'error', error: 'oauth_failed' };
  }

  if (result.type === 'success') {
    const { code, error } = parseAuthResultUrl(result.url);
    if (error || !code) {
      cancelPendingSignIn();
      return { type: 'error', error: error ?? 'oauth_failed' };
    }
    return { type: 'code', code };
  }
  // iOS "cancel" is an explicit user cancel. Android may report "dismiss" while the redirect is still
  // delivered through the router (auth/callback route), so keep the verifier until it expires.
  if (result.type === 'cancel') cancelPendingSignIn();
  return { type: 'cancelled' };
}
