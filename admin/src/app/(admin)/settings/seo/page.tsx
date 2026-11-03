import type { Metadata } from 'next';

import { SeoView } from './seo-view';

export const metadata: Metadata = { title: 'SEO' };

export default function SeoPage() {
  return <SeoView />;
}
