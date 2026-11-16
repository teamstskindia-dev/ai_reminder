import { api } from '../client';
import type { AuthMe, ExchangeResult, User, UserSettings, UserSettingsPatch } from '../types';

/** POST /auth/exchange with the PKCE verifier (required for platform=mobile flows). */
export function exchangeCode(code: string, codeVerifier: string): Promise<ExchangeResult> {
  return api<ExchangeResult>('/auth/exchange', { method: 'POST', body: { code, codeVerifier }, auth: false });
}

/** Email sign-in step 1: emails a 6-digit code (printed in the API log in development without SMTP). */
export function startEmailSignIn(email: string): Promise<void> {
  return api<void>('/auth/email/start', { method: 'POST', body: { email }, auth: false });
}

/** Email sign-in step 2: verifies the code and returns tokens like the Google exchange. */
export function verifyEmailSignIn(email: string, code: string): Promise<ExchangeResult> {
  return api<ExchangeResult>('/auth/email/verify', { method: 'POST', body: { email, code }, auth: false });
}

/** Sign in with Apple (iOS): Apple's identity token plus the name Apple shares on first sign-in. */
export function appleSignIn(input: { identityToken: string; givenName?: string; familyName?: string }): Promise<ExchangeResult> {
  return api<ExchangeResult>('/auth/apple', { method: 'POST', body: input, auth: false });
}

export function logout(refreshToken: string | null): Promise<void> {
  return api<void>('/auth/logout', {
    method: 'POST',
    body: refreshToken ? { refreshToken } : {},
    auth: false,
    timeoutMs: 6_000,
  });
}

export function fetchAuthMe(): Promise<AuthMe> {
  return api<AuthMe>('/auth/me');
}

export function updateMe(input: { name?: string; timezone?: string; locale?: string; onboarded?: true }): Promise<User> {
  return api<User>('/me', { method: 'PATCH', body: input });
}

export function deleteAccount(): Promise<void> {
  return api<void>('/me', { method: 'DELETE' });
}

export function updateSettings(input: UserSettingsPatch): Promise<UserSettings> {
  return api<UserSettings>('/me/settings', { method: 'PATCH', body: input });
}
