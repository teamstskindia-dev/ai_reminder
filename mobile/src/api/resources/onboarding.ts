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

type VoiceNoteResponse =
  | { success: true; data: { text: string } }
  | { success: false; error: { code: ErrorCode; message: string }; requestId?: string };

/**
 * One multipart POST. Uses XMLHttpRequest, not fetch: Expo replaces the global fetch with `expo/fetch`,
 * which rejects React Native's `{ uri, name, type }` file parts ("Unsupported FormDataPart
 * implementation"). React Native's own XHR still streams the file from its URI.
 */
function postVoiceNote(uri: string, token: string | null): Promise<string> {
  const form = new FormData();
  const name = uri.split('/').pop() || 'voice-note.m4a';
  form.append('file', { uri, name, type: 'audio/mp4' } as unknown as Blob);

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/onboarding/transcribe`);
    xhr.timeout = 90_000;
    xhr.setRequestHeader('Accept', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.onload = () => {
      let json: VoiceNoteResponse | null = null;
      try {
        json = JSON.parse(xhr.responseText) as VoiceNoteResponse;
      } catch {
        json = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && json?.success === true) {
        resolve(json.data.text);
        return;
      }
      const body = json && json.success === false ? json : null;
      reject(
        new ApiError({
          code: body?.error.code ?? 'INTERNAL_ERROR',
          status: xhr.status,
          message: body?.error.message ?? `Request failed (${xhr.status})`,
          requestId: body?.requestId ?? null,
        }),
      );
    };
    xhr.onerror = () => reject(new ApiError({ code: 'NETWORK_ERROR', status: 0, message: 'Network request failed' }));
    xhr.ontimeout = () => reject(new ApiError({ code: 'TIMEOUT', status: 0, message: 'Request timed out' }));
    xhr.send(form);
  });
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
