'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useEffect, useState, type ReactNode } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setSessionExpiredHandler } from '@/lib/api/client';
import { isApiError, isErrorHandled, isForbidden, isUnexpectedError } from '@/lib/api/errors';
import { toastError } from '@/lib/api/mutation';
import { queryKeys } from '@/lib/api/query-keys';
import { logger, reportError } from '@/lib/logger';

/** Retry only what can succeed on a second try: network failures and 5xx (incl. 502 UPSTREAM_ERROR). */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (!isApiError(error)) return false;
  if (error.status === 0 || error.status >= 500) return failureCount < 2;
  return false;
}

function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 300);
}

/** Only the resource name of a query key is logged — params can contain search text or ids of people. */
function keyLabel(key: readonly unknown[]): string {
  return key
    .slice(0, 2)
    .filter((k): k is string => typeof k === 'string')
    .join('.');
}

function logRequestError(error: unknown, source: 'query' | 'mutation', label: string): void {
  if (isUnexpectedError(error)) {
    reportError(error, { source, key: label });
  } else if (isApiError(error)) {
    logger.info(`${source} failed`, { source, key: label, code: error.code, status: error.status });
  }
}

function makeQueryClient() {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        logRequestError(error, 'query', keyLabel(query.queryKey));
        if (isForbidden(error) && query.queryKey[0] !== 'auth') {
          // The admin's role may have changed: refresh the session so the UI re-gates.
          void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
        }
        // Screens render their own error state on first load; only background refetch failures are toasted.
        if (query.state.data !== undefined) toastError(error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        logRequestError(error, 'mutation', keyLabel(mutation.options.mutationKey ?? ['mutation']));
        if (isForbidden(error)) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
        }
        if (mutation.meta?.errorToast !== false) {
          // Deferred one tick so a caller awaiting mutateAsync can mark the error as shown inline first.
          setTimeout(() => {
            if (!isErrorHandled(error)) toastError(error, { action: mutation.meta?.errorAction });
          }, 0);
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
        retryDelay,
      },
      mutations: { retry: false },
    },
  });
  return queryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  useEffect(() => {
    // A failed refresh ends the session: drop every cached response before redirecting to /login.
    setSessionExpiredHandler(() => {
      void queryClient.cancelQueries();
      queryClient.clear();
    });
    return () => setSessionExpiredHandler(null);
  }, [queryClient]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster richColors closeButton position="top-right" />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
