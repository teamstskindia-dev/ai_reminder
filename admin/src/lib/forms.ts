'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  useForm,
  type FieldValues,
  type Path,
  type UseFormProps,
  type UseFormReturn,
  type UseFormSetError,
} from 'react-hook-form';
import type { z } from 'zod';

import { isApiError, markErrorHandled } from '@/lib/api/errors';

/** `useForm` wired to a zod schema with consistent input/output typing. */
export function useZodForm<TIn extends FieldValues, TOut extends FieldValues>(
  schema: z.ZodType<TOut, TIn>,
  options?: Omit<UseFormProps<TIn, unknown, TOut>, 'resolver'>,
) {
  return useForm<TIn, unknown, TOut>({
    mode: 'onTouched',
    ...options,
    resolver: zodResolver(schema),
  });
}

export interface ApplyErrorsOptions {
  /** Path prefixes the API adds that the form does not have (e.g. "value." for settings). */
  stripPrefix?: string | string[];
  /** Prefix to try when the API path is relative to a nested object (e.g. "content." for section content). */
  addPrefix?: string;
  /** Only map these top-level fields (and their children). */
  knownFields?: readonly string[];
  /** Decide whether a candidate path exists in the form; the first matching candidate wins. */
  isKnownField?: (path: string) => boolean;
}

/** "items[2].title" → "items.2.title". */
export function normalizeFieldPath(field: string): string {
  return field.replace(/\[(\d+)\]/g, '.$1').replace(/^\.+/, '');
}

function candidates(field: string, options?: ApplyErrorsOptions): string[] {
  const base = normalizeFieldPath(field);
  const list = [base];
  for (const prefix of options?.stripPrefix ? [options.stripPrefix].flat() : []) {
    if (base.startsWith(prefix)) list.unshift(base.slice(prefix.length));
  }
  if (options?.addPrefix && !base.startsWith(options.addPrefix)) list.push(`${options.addPrefix}${base}`);
  return list.filter(Boolean);
}

/**
 * Map API VALIDATION_ERROR details (`{ field, messages }[]`, dot paths such as "value.primaryColor" or
 * "items.2.title") onto react-hook-form fields. Returns the number of fields that received an error.
 */
export function applyApiErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  options?: ApplyErrorsOptions,
): number {
  if (!isApiError(error) || error.code !== 'VALIDATION_ERROR') return 0;
  let applied = 0;
  for (const detail of error.validationDetails) {
    const options_ = candidates(detail.field, options);
    const field = options?.isKnownField ? options_.find((c) => options.isKnownField?.(c)) : options_[0];
    if (!field) continue;
    if (options?.knownFields && !options.knownFields.some((k) => field === k || field.startsWith(`${k}.`))) continue;
    setError(field as Path<T>, { type: 'server', message: detail.messages.join(' ') }, { shouldFocus: applied === 0 });
    applied += 1;
  }
  return applied;
}

/**
 * `applyApiErrors` for a whole form: only maps paths that exist in the form's values, and when every issue
 * landed on a visible field marks the error as handled (no duplicate toast).
 */
export function applyFormErrors<T extends FieldValues, TT extends FieldValues>(
  error: unknown,
  form: UseFormReturn<T, unknown, TT>,
  options?: Omit<ApplyErrorsOptions, 'isKnownField'>,
): number {
  const isKnownField = (path: string) => form.getValues(path as Path<T>) !== undefined;
  const resolved: ApplyErrorsOptions = { ...options, isKnownField };
  const applied = applyApiErrors(error, form.setError, resolved);
  if (applied > 0 && isApiError(error) && applied === error.validationDetails.length) markErrorHandled(error);
  return applied;
}
