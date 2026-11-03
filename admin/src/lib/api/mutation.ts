'use client';

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';

import { getErrorMessage, getErrorReference, isApiError, type ErrorAction } from './errors';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Set false when the caller shows the error itself (inline in a dialog or form). */
      errorToast?: boolean;
      /** Context for clearer messages (e.g. 413/415 on uploads). */
      errorAction?: ErrorAction;
    };
  }
}

type Resolvable<R, TData, TVars> = R | ((data: TData, vars: TVars) => R);

export interface ApiMutationOptions<TData, TVars> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /** Query keys (prefixes) to invalidate after success. */
  invalidate?: Resolvable<readonly QueryKey[], TData, TVars>;
  /** Success toast. `false` disables it. */
  success?: Resolvable<string | false, TData, TVars>;
  /** Show the global error toast (default true). Set false when the error is shown locally. */
  errorToast?: boolean;
  errorAction?: ErrorAction;
  onSuccess?: (data: TData, vars: TVars) => void | Promise<void>;
}

function resolve<R, TData, TVars>(value: Resolvable<R, TData, TVars>, data: TData, vars: TVars): R {
  return typeof value === 'function' ? (value as (d: TData, v: TVars) => R)(data, vars) : value;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Reference copied');
  } catch {
    toast.error('Could not copy the reference');
  }
}

/**
 * Error toast with the right message for the error type: validation details, rate-limit wait time, upload
 * limits, and — for unexpected (5xx) errors — generic text plus a copyable reference instead of server text.
 */
export function toastError(error: unknown, options?: { action?: ErrorAction }): void {
  const message = getErrorMessage(error, { action: options?.action });
  if (isApiError(error) && error.code === 'VALIDATION_ERROR') {
    const details = error.validationDetails;
    toast.error(message, {
      description: details.length
        ? details
            .slice(0, 4)
            .map((d) => `${d.field}: ${d.messages.join(', ')}`)
            .join('\n')
        : undefined,
    });
    return;
  }
  const reference = getErrorReference(error);
  if (reference) {
    toast.error(message, {
      description: `Reference: ${reference}`,
      duration: 12_000,
      action: { label: 'Copy reference', onClick: () => void copy(reference) },
    });
    return;
  }
  toast.error(message);
}

/**
 * `useMutation` with the admin conventions baked in: invalidate the right query keys and toast success.
 * Errors are logged and toasted globally by the MutationCache (see Providers) unless `errorToast: false`.
 * Callers can still `await mutateAsync()` to map validation details onto fields with `applyApiErrors`.
 */
export function useApiMutation<TData = unknown, TVars = void>(options: ApiMutationOptions<TData, TVars>) {
  const queryClient = useQueryClient();
  const { mutationFn, invalidate, success, errorToast = true, errorAction, onSuccess } = options;
  const staticKey = Array.isArray(invalidate) ? (invalidate[0] as readonly unknown[] | undefined)?.[0] : undefined;
  return useMutation<TData, unknown, TVars>({
    mutationFn,
    // Resource name only, used to label errors in logs.
    mutationKey: [typeof staticKey === 'string' ? staticKey : 'mutation'],
    meta: { errorToast, errorAction },
    onSuccess: async (data, vars) => {
      if (invalidate) {
        const keys = resolve(invalidate, data, vars);
        await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      }
      if (success !== undefined) {
        const message = resolve(success, data, vars);
        if (message) toast.success(message);
      }
      await onSuccess?.(data, vars);
    },
  });
}
