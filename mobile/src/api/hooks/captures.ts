import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/providers/AuthProvider';

import { qk } from '../queryKeys';
import {
  decideFollowUp,
  deleteCapture,
  fetchCapture,
  fetchCaptures,
  linkCapture,
  renameCapture,
  retryCapture,
  reviewCapture,
} from '../resources/captures';
import type { CaptureDetail, CaptureListItem, CaptureReviewInput } from '../types';

const busy = (status: CaptureListItem['status'] | undefined) => status === 'uploading' || status === 'processing';

/** Recent recorded conversations; polls while one is still being processed. */
export function useCaptures() {
  const { status } = useAuth();
  return useQuery({
    queryKey: qk.captures.list,
    queryFn: () => fetchCaptures(10),
    enabled: status === 'signedIn',
    refetchInterval: (query) => (query.state.data?.some((c) => busy(c.status)) ? 5000 : false),
  });
}

/** One recorded conversation (the review card); polls until processing is done. */
export function useCapture(id: string) {
  return useQuery({
    queryKey: qk.captures.detail(id),
    queryFn: () => fetchCapture(id),
    enabled: Boolean(id),
    refetchInterval: (query) => (busy(query.state.data?.status) ? 4000 : false),
  });
}

/** After a capture changes: its detail, the list, and everything its items show up in. */
function useRefreshAfter() {
  const qc = useQueryClient();
  return (detail?: CaptureDetail) => {
    if (detail) qc.setQueryData(qk.captures.detail(detail.id), detail);
    void qc.invalidateQueries({ queryKey: qk.captures.list });
    void qc.invalidateQueries({ queryKey: qk.today });
    void qc.invalidateQueries({ queryKey: qk.reminders.all });
    void qc.invalidateQueries({ queryKey: qk.actionItems.all });
  };
}

export function useReviewCapture(id: string) {
  const refresh = useRefreshAfter();
  return useMutation({ mutationFn: (input: CaptureReviewInput) => reviewCapture(id, input), onSuccess: refresh });
}

export function useRenameCapture(id: string) {
  const refresh = useRefreshAfter();
  return useMutation({ mutationFn: (title: string) => renameCapture(id, title), onSuccess: refresh });
}

export function useLinkCapture(id: string) {
  const refresh = useRefreshAfter();
  return useMutation({ mutationFn: (meetingId: string | null) => linkCapture(id, meetingId), onSuccess: refresh });
}

export function useFollowUpDecision(id: string) {
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: (input: { status: 'sent' | 'skipped'; subject?: string; body?: string }) => decideFollowUp(id, input),
    onSuccess: refresh,
  });
}

export function useRetryCapture(id: string) {
  const refresh = useRefreshAfter();
  return useMutation({ mutationFn: () => retryCapture(id), onSuccess: refresh });
}

export function useDeleteCapture() {
  const qc = useQueryClient();
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: (id: string) => deleteCapture(id),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: qk.captures.detail(id) });
      void qc.invalidateQueries({ queryKey: qk.meetings.all });
      refresh();
    },
  });
}
