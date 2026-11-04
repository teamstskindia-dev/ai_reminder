'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { BotProviderStatus, RecallConnectionTest } from './types';

export const botApi = {
  providers: (signal?: AbortSignal) => api.get<BotProviderStatus>('/admin/bot/providers', undefined, signal),
  testRecall: () => api.post<RecallConnectionTest>('/admin/bot/recall/test'),
};

/** Which meeting bot providers the server is configured for (secrets reported as set / not set only). */
export function useBotProviders() {
  return useQuery({
    queryKey: queryKeys.bot.providers(),
    queryFn: ({ signal }) => botApi.providers(signal),
  });
}

/** Asks the API to call Recall.ai with the configured key; the result is shown inline. */
export function useTestRecall() {
  return useApiMutation({
    mutationFn: () => botApi.testRecall(),
    success: false,
  });
}
