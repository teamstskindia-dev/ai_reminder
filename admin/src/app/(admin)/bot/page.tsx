import type { Metadata } from 'next';

import { BotView } from './bot-view';

export const metadata: Metadata = { title: 'Meeting bot' };

export default function BotPage() {
  return <BotView />;
}
