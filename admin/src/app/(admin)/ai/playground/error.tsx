'use client';

import { RouteError } from '@/components/common/route-error';

export default function PlaygroundError({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteError error={error} retry={retry} scope="ai-playground" title="The AI playground hit an error" />;
}
