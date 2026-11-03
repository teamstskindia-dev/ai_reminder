import type { Metadata } from 'next';

import { SectionEditorView } from './section-editor-view';

export const metadata: Metadata = { title: 'Edit section' };

export default function SectionEditorPage() {
  return <SectionEditorView />;
}
