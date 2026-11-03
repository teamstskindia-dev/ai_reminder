import type { Metadata } from 'next';

import { PageEditView } from './page-edit-view';

export const metadata: Metadata = { title: 'Edit page' };

export default function EditCmsPage() {
  return <PageEditView />;
}
