"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { setAuthFailureHandler, setMaintenanceHandler } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { describeError, logger, reportError } from "@/lib/logger";
import { maintenanceStore } from "@/lib/maintenance";
import { hardNavigate } from "@/lib/navigation";
import { toastError } from "@/lib/notify";

const PUBLIC_PREFIXES = ["/login", "/auth/"];

/** Retry transient failures only: network errors and 5xx/502 (twice, with backoff). Never 4xx or maintenance. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!isApiError(error)) return true;
  if (error.code === "MAINTENANCE") return false;
  if (error.code === "NETWORK_ERROR") return true;
  return error.status >= 500;
}

const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 250);

function isExpected(error: unknown) {
  // Auth expiry and maintenance have their own flows; 404s are normal UI states.
  return isApiError(error) && (error.status === 401 || error.code === "MAINTENANCE" || error.status === 404);
}

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isApiError(error) && error.code === "MAINTENANCE") maintenanceStore.set(true);
        if (isExpected(error)) return;
        const context = { where: "query", queryKey: String(query.queryKey[0] ?? "") };
        if (isApiError(error) && error.status < 500 && error.code !== "NETWORK_ERROR") logger.warn("query failed", { ...context, ...describeError(error) });
        else reportError(error, context);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (isApiError(error) && error.code === "MAINTENANCE") maintenanceStore.set(true);
        const context = { where: "mutation", mutationKey: String(mutation.options.mutationKey?.[0] ?? "") };
        if (isApiError(error) && error.status < 500 && error.code !== "NETWORK_ERROR") logger.warn("mutation failed", { ...context, ...describeError(error) });
        else if (!isExpected(error)) reportError(error, context);
        if (mutation.meta?.silent) return;
        if (isApiError(error) && error.status === 401) return; // redirecting to sign-in
        toastError(error);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: shouldRetry,
        retryDelay,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  useEffect(() => {
    let redirecting = false;
    setAuthFailureHandler(() => {
      if (redirecting) return;
      const { pathname, search } = window.location;
      if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return;
      redirecting = true;
      logger.info("session expired; redirecting to sign-in");
      queryClient.clear();
      // `reauth` tells the proxy not to bounce /login → /dashboard while a stale cookie is still present.
      hardNavigate(`/login?next=${encodeURIComponent(pathname + search)}&reauth=1`);
    });
    setMaintenanceHandler(() => maintenanceStore.set(true));
    return () => {
      setAuthFailureHandler(null);
      setMaintenanceHandler(null);
    };
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
