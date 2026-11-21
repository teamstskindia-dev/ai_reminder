import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/providers/AuthProvider';

import { qk } from '../queryKeys';
import {
  createPerson,
  deletePerson,
  fetchCorrections,
  fetchExportStatus,
  fetchMoodInsights,
  fetchPerson,
  fetchTimeline,
  fixName,
  listPeople,
  removeCorrection,
  requestExport,
  searchMemory,
  updatePerson,
  updateProfile,
  updateSummary,
  updateTranscriptLine,
} from '../resources/memory';
import type { DataExportStatus, NameCorrection, ProfilePatch, UserProfile } from '../types';

/** Memory, You and privacy (user-flow §10). */

export function useMemoryTimeline() {
  return useInfiniteQuery({
    queryKey: qk.memory.timeline,
    queryFn: ({ pageParam }) => fetchTimeline(pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useMemorySearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: qk.memory.search(term),
    queryFn: () => searchMemory(term),
    enabled: term.length >= 2,
    staleTime: 60_000,
  });
}

export function usePeople(q = '') {
  return useQuery({ queryKey: qk.memory.people(q.trim()), queryFn: () => listPeople(q.trim() || undefined) });
}

export function usePerson(id: string) {
  return useQuery({ queryKey: qk.memory.person(id), queryFn: () => fetchPerson(id), enabled: !!id });
}

/** Anything that changes memory refreshes people, the timeline and the open conversation. */
function useInvalidateMemory() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.memory.all });
    void qc.invalidateQueries({ queryKey: qk.captures.all });
    void qc.invalidateQueries({ queryKey: qk.meetings.all });
    void qc.invalidateQueries({ queryKey: qk.actionItems.all });
    void qc.invalidateQueries({ queryKey: qk.reminders.all });
  };
}

export function useCreatePerson() {
  const invalidate = useInvalidateMemory();
  return useMutation({ mutationFn: createPerson, onSuccess: invalidate });
}

export function useUpdatePerson(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateMemory();
  return useMutation({
    mutationFn: (body: { name?: string; relationship?: string | null; facts?: string[] }) => updatePerson(id, body),
    onSuccess: (person) => {
      qc.setQueryData(qk.memory.person(person.id), person);
      invalidate();
    },
  });
}

export function useDeletePerson() {
  const invalidate = useInvalidateMemory();
  return useMutation({ mutationFn: deletePerson, onSuccess: invalidate });
}

export function useFixName(conversationId: string) {
  const invalidate = useInvalidateMemory();
  return useMutation({
    mutationFn: (body: { from: string; to: string; onlyHere?: boolean }) => fixName(conversationId, body),
    onSuccess: invalidate,
  });
}

export function useUpdateSummary(conversationId: string) {
  const invalidate = useInvalidateMemory();
  return useMutation({ mutationFn: (summary: string) => updateSummary(conversationId, summary), onSuccess: invalidate });
}

export function useUpdateTranscriptLine(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ seq, text }: { seq: number; text: string }) => updateTranscriptLine(conversationId, seq, text),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.meetings.transcript(conversationId) }),
  });
}

export function useCorrections() {
  return useQuery({ queryKey: qk.memory.corrections, queryFn: fetchCorrections });
}

export function useRemoveCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: removeCorrection,
    onSuccess: (list) => qc.setQueryData<NameCorrection[]>(qk.memory.corrections, list),
  });
}

export function useMoodInsights() {
  const { status } = useAuth();
  return useQuery({ queryKey: qk.moodInsights, queryFn: fetchMoodInsights, enabled: status === 'signedIn', staleTime: 10 * 60_000 });
}

/** PATCH /me/profile: edit, correct or delete anything the friend knows about the user. */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => updateProfile(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.profile });
      const previous = qc.getQueryData<UserProfile>(qk.profile);
      if (previous) qc.setQueryData<UserProfile>(qk.profile, { ...previous, ...patch });
      return previous;
    },
    onError: (_e, _p, previous) => {
      if (previous) qc.setQueryData(qk.profile, previous);
    },
    onSuccess: (profile) => qc.setQueryData<UserProfile>(qk.profile, profile),
  });
}

export function useDataExport() {
  return useQuery({
    queryKey: qk.dataExport,
    queryFn: fetchExportStatus,
    // While the export is being prepared, check again every few seconds.
    refetchInterval: (query) => (query.state.data?.status === 'preparing' ? 5000 : false),
  });
}

export function useRequestExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: requestExport,
    onSuccess: (status) => qc.setQueryData<DataExportStatus>(qk.dataExport, status),
  });
}
