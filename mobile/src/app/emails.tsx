import { useLocalSearchParams } from 'expo-router';

import type { EmailFilter } from '@/api/types';
import { EmailsScreen } from '@/features/email/EmailsScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/RouteErrorBoundary';

const FILTERS: EmailFilter[] = ['important', 'needs_reply', 'fyi', 'all'];

export default function EmailsRoute() {
  const { filter } = useLocalSearchParams<{ filter?: string }>();
  return <EmailsScreen initialFilter={FILTERS.includes(filter as EmailFilter) ? (filter as EmailFilter) : 'important'} />;
}
