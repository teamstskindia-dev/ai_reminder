'use client';

import { useEffect } from 'react';

import { ErrorReference } from '@/components/common/error-reference';
import { boundaryReference } from '@/components/common/route-error';
import { reportError } from '@/lib/logger';

import './globals.css';

/** Replaces the root layout when it crashes: own document, no providers, plain buttons. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const reference = boundaryReference(error);

  useEffect(() => {
    reportError(error, { boundary: 'global', reference });
  }, [error, reference]);

  return (
    <html lang="en">
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        <title>Something went wrong · Remi Admin</title>
        <main role="alert" className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">The admin panel could not load</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            An unexpected error stopped the page from rendering. Try again, or reload the page.
          </p>
          <ErrorReference reference={reference} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => retry()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Reload page
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
