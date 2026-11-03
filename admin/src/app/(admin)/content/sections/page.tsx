import type { Metadata } from 'next';

import { SectionsView } from './sections-view';

export const metadata: Metadata = { title: 'Landing & sections' };

export default function SectionsPage() {
  return <SectionsView />;
}
