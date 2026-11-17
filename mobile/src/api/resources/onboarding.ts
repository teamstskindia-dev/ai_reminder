import { api } from '../client';
import { uploadMultipart } from '../multipart';
import type { OnboardingChatMessage, OnboardingChatReply, User, UserProfile } from '../types';

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

/** Uploads a recorded voice answer and returns the transcript. */
export async function transcribeVoiceNote(uri: string): Promise<string> {
  const name = uri.split('/').pop() || 'voice-note.m4a';
  const res = await uploadMultipart<{ text: string }>('/onboarding/transcribe', {
    file: { uri, name, type: 'audio/mp4' },
    timeoutMs: 90_000,
  });
  return res.text;
}
