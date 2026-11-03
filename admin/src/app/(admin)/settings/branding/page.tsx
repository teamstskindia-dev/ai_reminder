import type { Metadata } from 'next';

import { BrandingView } from './branding-view';

export const metadata: Metadata = { title: 'Branding' };

export default function BrandingPage() {
  return <BrandingView />;
}
