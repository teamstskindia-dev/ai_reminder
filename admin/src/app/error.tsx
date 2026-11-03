'use client';

import { RouteError } from '@/components/common/route-error';

/** Catches errors in the admin shell and the login page (the root layout is covered by global-error). */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto max-w-2xl px-4">
      <RouteError error={error} retry={retry} scope="root" title="The admin panel hit an unexpected error" fullPage />
    </main>
  );
}
