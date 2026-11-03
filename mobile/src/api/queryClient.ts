import NetInfo from '@react-native-community/netinfo';
import { focusManager, MutationCache, onlineManager, QueryCache, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { reportError } from '@/utils/logger';
import { toast } from '@/utils/toast';

import { getErrorMessage, isApiError } from './errors';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** The caller shows its own error UI (form field errors, inline bubble…): skip the global toast. */
      handlesErrors?: boolean;
    };
  }
}

const MAX_RETRIES = 2;

/** No retries for 4xx (or maintenance); up to two for network failures, timeouts, 5xx and 502 UPSTREAM_ERROR. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES || !isApiError(error)) return false;
  if (error.isNetwork) return true;
  if (error.code === 'MAINTENANCE') return false;
  return error.status >= 500;
}

function retryDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, 8_000) + Math.round(Math.random() * 250);
}

/** Expected errors (auth expiry, not found, offline) are not worth reporting. */
function isReportable(error: unknown): boolean {
  if (!isApiError(error)) return true;
  if (error.isNetwork || error.code === 'MAINTENANCE') return false;
  return error.isServerError || error.code === 'UPSTREAM_ERROR';
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Only the first key segment: later segments can carry ids or search text.
      if (isReportable(error)) reportError(error, { source: 'query', query: String(query.queryKey[0]) });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (isReportable(error)) reportError(error, { source: 'mutation', mutation: String(mutation.options.mutationKey?.[0] ?? 'anonymous') });
      if (!mutation.meta?.handlesErrors) toast(getErrorMessage(error));
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: shouldRetry,
      retryDelay,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // Default networkMode 'online': queries pause while offline and resume on reconnect.
    },
    mutations: {
      retry: false,
      // Fail fast with a friendly "you're offline" instead of silently queueing user actions.
      networkMode: 'always',
    },
  },
});

/** React Query's "window focus" on native = the app returning to the foreground. */
focusManager.setEventListener((handleFocus) => {
  if (Platform.OS === 'web') return undefined;
  const subscription = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
  return () => subscription.remove();
});

/** Online state from NetInfo. Unknown (null) counts as online so a slow first probe never blocks the UI. */
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false);
  }),
);
