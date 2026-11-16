import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/providers/AuthProvider';

import { qk } from '../queryKeys';
import {
  dismissNudge,
  fetchCheckinToday,
  fetchNudge,
  fetchRecaps,
  fetchToday,
  finishCheckin,
  replyCheckin,
  replyNudge,
} from '../resources/companion';
import type { CheckinReply, CompanionNudge, DailyCheckin, NudgeReply } from '../types';

export function useToday() {
  const { status } = useAuth();
  return useQuery({ queryKey: qk.today, queryFn: fetchToday, enabled: status === 'signedIn' });
}

export function useCheckinToday() {
  return useQuery({ queryKey: qk.checkin, queryFn: fetchCheckinToday, staleTime: 0 });
}

function useApplyCheckin() {
  const qc = useQueryClient();
  return (res: CheckinReply) => {
    qc.setQueryData<DailyCheckin>(qk.checkin, res.checkin);
    if (res.done) void qc.invalidateQueries({ queryKey: qk.today });
  };
}

export function useCheckinReply() {
  const apply = useApplyCheckin();
  return useMutation({ mutationFn: (text: string) => replyCheckin(text), onSuccess: apply });
}

export function useCheckinFinish() {
  const apply = useApplyCheckin();
  return useMutation({ mutationFn: () => finishCheckin(), onSuccess: apply });
}

export function useNudge(id: string) {
  return useQuery({ queryKey: qk.nudge(id), queryFn: () => fetchNudge(id), enabled: Boolean(id) });
}

export function useNudgeReply(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => replyNudge(id, text),
    onSuccess: (res: NudgeReply) => qc.setQueryData<CompanionNudge>(qk.nudge(id), res.nudge),
  });
}

export function useDismissNudge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismissNudge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.today }),
  });
}

export function useRecaps() {
  return useQuery({ queryKey: qk.recaps, queryFn: () => fetchRecaps(8), staleTime: 10 * 60_000 });
}
