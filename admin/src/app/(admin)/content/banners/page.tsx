import type { Metadata } from 'next';

import { BannersView } from './banners-view';

export const metadata: Metadata = { title: 'Banners' };

export default function BannersPage() {
  return <BannersView />;
}
