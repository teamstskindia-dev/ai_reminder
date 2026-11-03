import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { removeEntity, restoreSnapshot } from '../cache';
import { qk } from '../queryKeys';
import { askAssistant, deleteThread, listThreadMessages, listThreads } from '../resources/assistant';
import type { AskInput } from '../types';

import { nextPageParam, PAGE_SIZE } from './pagination';

export function useThreadsInfinite(enabled = true) {
  return useInfiniteQuery({
    queryKey: qk.assistant.threads,
    queryFn: ({ pageParam }) => listThreads({ page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
    enabled,
  });
}

export function useThreadMessages(threadId: string | null) {
  return useQuery({
    queryKey: qk.assistant.messages(threadId ?? ''),
    queryFn: () => listThreadMessages(threadId as string),
    enabled: Boolean(threadId),
  });
}

export function useAsk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AskInput) => askAssistant(input),
    meta: { handlesErrors: true },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.assistant.threads });
    },
  });
}

export function useDeleteThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => deleteThread(threadId),
    onMutate: (threadId) => removeEntity(qc, [qk.assistant.threads], threadId),
    onError: (_error, _vars, snapshot) => restoreSnapshot(qc, snapshot),
    onSuccess: (_data, threadId) => qc.removeQueries({ queryKey: qk.assistant.messages(threadId) }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.assistant.threads }),
  });
}
