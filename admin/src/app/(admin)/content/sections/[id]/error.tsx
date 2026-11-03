'use client';

import { RouteError } from '@/components/common/route-error';

export default function SectionEditorError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <RouteError
      error={error}
      retry={retry}
      scope="section-editor"
      title="The section editor hit an error"
    />
  );
}
