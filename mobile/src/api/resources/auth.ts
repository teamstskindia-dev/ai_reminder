import { api } from '../client';
import type { AuthMe, ExchangeResult, User, UserSettings } from '../types';

/** POST /auth/exchange with the PKCE verifier (required for platform=mobile flows). */
export function exchangeCode(code: string, codeVerifier: string): Promise<ExchangeResult> {
  return api<ExchangeResult>('/auth/exchange', { method: 'POST', body: { code, codeVerifier }, auth: false });
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

export function updateSettings(input: Partial<UserSettings>): Promise<UserSettings> {
  return api<UserSettings>('/me/settings', { method: 'PATCH', body: input });
}
