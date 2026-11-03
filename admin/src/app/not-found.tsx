import type { Metadata } from 'next';

import { NotFoundView } from '@/components/common/not-found-view';

export const metadata: Metadata = { title: 'Not found' };

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <NotFoundView />
    </main>
  );
}
