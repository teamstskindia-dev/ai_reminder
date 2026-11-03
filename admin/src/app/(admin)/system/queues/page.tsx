import type { Metadata } from 'next';

import { QueuesView } from './queues-view';

export const metadata: Metadata = { title: 'Queues' };

export default function QueuesPage() {
  return <QueuesView />;
}
