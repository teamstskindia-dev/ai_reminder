import type { Metadata } from 'next';

import { ThemeView } from './theme-view';

export const metadata: Metadata = { title: 'Theme' };

export default function ThemePage() {
  return <ThemeView />;
}
