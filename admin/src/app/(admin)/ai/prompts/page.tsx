import type { Metadata } from 'next';

import { PromptsView } from './prompts-view';

export const metadata: Metadata = { title: 'AI prompts' };

export default function PromptsPage() {
  return <PromptsView />;
}
