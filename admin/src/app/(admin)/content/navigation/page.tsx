import type { Metadata } from 'next';

import { NavigationView } from './navigation-view';

export const metadata: Metadata = { title: 'Navigation' };

export default function NavigationPage() {
  return <NavigationView />;
}
