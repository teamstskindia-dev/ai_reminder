import type { Metadata } from 'next';

import { UserDetailView } from './user-detail-view';

export const metadata: Metadata = { title: 'User' };

export default function UserDetailPage() {
  return <UserDetailView />;
}
