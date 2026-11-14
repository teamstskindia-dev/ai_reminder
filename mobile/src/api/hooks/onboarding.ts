import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/providers/AuthProvider';

import { qk } from '../queryKeys';
import { buildProfile, deleteProfile, fetchProfile, onboardingChat, transcribeVoiceNote } from '../resources/onboarding';
import type { OnboardingChatMessage, UserProfile } from '../types';

/** What the friend knows about the user (GET /me/profile). */
export function useProfile() {
  const { status } = useAuth();
  return useQuery({ queryKey: qk.profile, queryFn: fetchProfile, enabled: status === 'signedIn', staleTime: 5 * 60_000 });
}

export function useOnboardingChat() {
  return useMutation({ mutationFn: (messages: OnboardingChatMessage[]) => onboardingChat(messages) });
}

export function useBuildProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messages: OnboardingChatMessage[]) => buildProfile(messages),
    onSuccess: (profile) => qc.setQueryData<UserProfile>(qk.profile, profile),
  });
}

export function useTranscribe() {
  return useMutation({ mutationFn: (uri: string) => transcribeVoiceNote(uri) });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteProfile,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.profile }),
  });
}
