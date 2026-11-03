import type { Metadata } from 'next';

import { PageEditor } from '@/components/cms/page-editor';

export const metadata: Metadata = { title: 'New page' };

export default function NewCmsPage() {
  return <PageEditor />;
}
