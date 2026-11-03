'use client';

import { AlertTriangle, Home, RefreshCw, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { getErrorMessage, getErrorReference, isApiError } from '@/lib/api/errors';
import { reportError } from '@/lib/logger';
import { cn } from '@/lib/utils';

import { ErrorReference } from './error-reference';

/** FNV-1a hash → short stable id, so a client-side crash has a reference that matches the reported event. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Server request id, Next.js digest, or a stable hash of the client error. */
export function boundaryReference(error: unknown): string {
  const known = getErrorReference(error);
  if (known) return known;
  if (isApiError(error) && error.requestId) return error.requestId;
  if (error instanceof Error) {
    const firstFrame = error.stack?.split('\n')[1]?.trim() ?? '';
    return `c-${hash(`${error.name}:${error.message}:${firstFrame}`)}`;
  }
  return `c-${hash(String(error))}`;
}

interface RouteErrorProps {
  error: unknown;
  retry: () => void;
  /** Where the boundary lives, for the error report (e.g. "admin", "section-editor"). */
  scope: string;
  title?: string;
  /** Hide the dashboard link (e.g. when the shell itself is unavailable). */
  fullPage?: boolean;
}

/** Fallback UI for Next.js error boundaries: friendly message, reference id, retry and a way out. */
export function RouteError({ error, retry, scope, title = 'This page hit an unexpected error', fullPage = false }: RouteErrorProps) {
  const reference = boundaryReference(error);

  useEffect(() => {
    reportError(error, { boundary: scope, reference });
  }, [error, scope, reference]);

  // API errors carry safe, specific text; anything else is a client crash and gets generic copy.
  const message = isApiError(error)
    ? getErrorMessage(error)
    : 'Something broke while rendering this screen. Your saved data is not affected.';

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-8 text-center',
        fullPage ? 'min-h-svh border-0' : 'min-h-[50vh]',
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <div className="max-w-md space-y-1.5">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      <ErrorReference reference={reference} />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => retry()}>
          <RotateCcw /> Try again
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RefreshCw /> Reload page
        </Button>
        {!fullPage ? (
          <Button variant="ghost" asChild>
            <Link href="/">
              <Home /> Dashboard
            </Link>
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">If this keeps happening, send the reference to your engineering team.</p>
    </div>
  );
}
