import type { Metadata } from 'next';

import { TemplatesView } from './templates-view';

export const metadata: Metadata = { title: 'Notification templates' };

export default function TemplatesPage() {
  return <TemplatesView />;
}
