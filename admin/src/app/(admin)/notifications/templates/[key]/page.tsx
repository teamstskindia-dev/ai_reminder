import type { Metadata } from 'next';

import { TemplateEditorView } from './template-editor-view';

export const metadata: Metadata = { title: 'Edit template' };

export default function TemplateEditorPage() {
  return <TemplateEditorView />;
}
