import type { Metadata } from 'next';

import { FeaturesView } from './features-view';

export const metadata: Metadata = { title: 'Features & app' };

export default function FeaturesPage() {
  return <FeaturesView />;
}
