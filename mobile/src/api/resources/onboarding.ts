import { API_BASE_URL } from '@/utils/env';

import { api, refreshSession } from '../client';
import { ApiError } from '../errors';
import { getAccessToken } from '../tokens';
import type { ErrorCode, OnboardingChatMessage, OnboardingChatReply, User, UserProfile } from '../types';

/** Next message of the get-to-know-you chat (empty history → the opening message). */
export function onboardingChat(messages: OnboardingChatMessage[]): Promise<OnboardingChatReply> {
  return api<OnboardingChatReply>('/onboarding/chat', { method: 'POST', body: { messages }, timeoutMs: 45_000 });
}

/** Builds the first personality profile from the chat (no answers → status `skipped`). */
export function buildProfile(messages: OnboardingChatMessage[]): Promise<UserProfile> {
  return api<UserProfile>('/onboarding/profile', { method: 'POST', body: { messages }, timeoutMs: 60_000 });
}

/** Stamps onboardedAt and sends the welcome email (idempotent). */
export function completeOnboarding(): Promise<User> {
  return api<User>('/onboarding/complete', { method: 'POST' });
}

export function fetchProfile(): Promise<UserProfile> {
  return api<UserProfile>('/me/profile');
}

export function deleteProfile(): Promise<void> {
  return api<void>('/me/profile', { method: 'DELETE' });
}

/** One multipart POST; the JSON client always sends application/json, so this uses fetch directly. */
async function postVoiceNote(uri: string, token: string | null): Promise<string> {
  const form = new FormData();
  const name = uri.split('/').pop() || 'voice-note.m4a';
  // React Native's FormData accepts { uri, name, type } file parts.
  form.append('file', { uri, name, type: 'audio/mp4' } as unknown as Blob);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/onboarding/transcribe`, {
      method: 'POST',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    throw new ApiError({
      code: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
      status: 0,
      message: error instanceof Error ? error.message : 'Network request failed',
    });
  } finally {
    clearTimeout(timeout);
  }
  const json = (await res.json().catch(() => null)) as
    | { success: true; data: { text: string } }
    | { success: false; error: { code: ErrorCode; message: string }; requestId?: string }
    | null;
  if (!res.ok || !json || json.success !== true) {
    const body = json && json.success === false ? json : null;
    throw new ApiError({
      code: body?.error.code ?? 'INTERNAL_ERROR',
      status: res.status,
      message: body?.error.message ?? `Request failed (${res.status})`,
      requestId: body?.requestId ?? null,
    });
  }
  return json.data.text;
}

/** Uploads a recorded voice answer and returns the transcript (one refresh-and-retry on 401). */
export async function transcribeVoiceNote(uri: string): Promise<string> {
  try {
    return await postVoiceNote(uri, await getAccessToken());
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const next = await refreshSession();
    if (!next) throw error;
    return postVoiceNote(uri, next);
  }
}
