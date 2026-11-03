'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { AiPrompt, AiTestResult } from './types';

export interface UpdatePromptInput {
  content: string;
  name?: string;
  description?: string | null;
}

export const aiApi = {
  prompts: (signal?: AbortSignal) => api.get<AiPrompt[]>('/admin/ai/prompts', undefined, signal),
  updatePrompt: (key: string, body: UpdatePromptInput) => api.put<AiPrompt>(`/admin/ai/prompts/${key}`, body),
  test: (body: { transcript: string; title?: string }) => api.post<AiTestResult>('/admin/ai/test', body),
};

export function useAiPrompts() {
  return useQuery({
    queryKey: queryKeys.ai.prompts(),
    queryFn: ({ signal }) => aiApi.prompts(signal),
  });
}

export function useUpdateAiPrompt(key: string) {
  return useApiMutation({
    mutationFn: (body: UpdatePromptInput) => aiApi.updatePrompt(key, body),
    invalidate: [queryKeys.ai.all],
    success: (prompt) => `Prompt saved (version ${prompt.version})`,
  });
}

export function useAiTest() {
  return useApiMutation({
    mutationFn: aiApi.test,
    success: (result) => `Report generated in ${(result.latencyMs / 1000).toFixed(1)} s`,
  });
}
