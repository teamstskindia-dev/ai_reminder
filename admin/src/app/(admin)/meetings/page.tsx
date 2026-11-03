import type { Metadata } from 'next';

import { MeetingsView } from './meetings-view';

export const metadata: Metadata = { title: 'Meetings' };

export default function MeetingsPage() {
  return <MeetingsView />;
}
