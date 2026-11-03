import type { Metadata } from 'next';

import { BroadcastsView } from './broadcasts-view';

export const metadata: Metadata = { title: 'Broadcasts' };

export default function BroadcastsPage() {
  return <BroadcastsView />;
}
