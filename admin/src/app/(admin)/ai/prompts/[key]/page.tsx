import type { Metadata } from 'next';

import { PromptEditorView } from './prompt-editor-view';

export const metadata: Metadata = { title: 'Edit prompt' };

export default function PromptEditorPage() {
  return <PromptEditorView />;
}
