'use client';

import { RouteError } from '@/components/common/route-error';

export default function MeetingDetailError({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteError error={error} retry={retry} scope="meeting-detail" title="This meeting could not be displayed" />;
}
