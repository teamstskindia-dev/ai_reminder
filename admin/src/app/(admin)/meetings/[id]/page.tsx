import type { Metadata } from 'next';

import { MeetingDetailView } from './meeting-detail-view';

export const metadata: Metadata = { title: 'Meeting' };

export default function MeetingDetailPage() {
  return <MeetingDetailView />;
}
