import type { Metadata } from 'next';

import { MediaView } from './media-view';

export const metadata: Metadata = { title: 'Media library' };

export default function MediaPage() {
  return <MediaView />;
}
