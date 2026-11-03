"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assistantApi } from "@/lib/api/assistant";
import type { AskInput, AssistantMessage } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";

export function useAssistantThreads() {
  return useQuery({ queryKey: qk.assistant.threads, queryFn: () => assistantApi.threads(1, 50) });
}

export function useThreadMessages(threadId: string | null) {
  return useQuery({
    queryKey: qk.assistant.messages(threadId ?? ""),
    queryFn: () => assistantApi.messages(threadId as string),
    enabled: Boolean(threadId),
  });
}

export function useAsk() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silent: true }, // the Ask view shows errors inline
    mutationFn: (input: AskInput) => assistantApi.ask(input),
    onSuccess: (result, input) => {
      // The API returns only the reply: append the question + reply locally, then sync in the background.
      const question: AssistantMessage = {
        id: `local-${result.message.id}`,
        threadId: result.threadId,
        role: "user",
        content: input.question,
        sources: [],
        createdAt: result.message.createdAt,
      };
      queryClient.setQueryData<AssistantMessage[]>(qk.assistant.messages(result.threadId), (prev) => {
        const list = prev ?? [];
        return list.some((m) => m.id === result.message.id) ? list : [...list, question, result.message];
      });
      void queryClient.invalidateQueries({ queryKey: qk.assistant.messages(result.threadId), refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: qk.assistant.threads });
    },
  });
}

export function useDeleteThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => assistantApi.removeThread(threadId),
    onSuccess: (_data, threadId) => {
      queryClient.removeQueries({ queryKey: qk.assistant.messages(threadId) });
      void queryClient.invalidateQueries({ queryKey: qk.assistant.threads });
    },
  });
}
