import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = { title: 'Not found' };

/** Catch-all so unknown admin URLs render the 404 inside the admin shell instead of a bare page. */
export default function MissingAdminPage() {
  notFound();
}
