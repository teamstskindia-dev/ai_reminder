import { useLocalSearchParams } from 'expo-router';

import { EmailDetailScreen } from '@/features/email/EmailDetailScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/RouteErrorBoundary';

export default function EmailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EmailDetailScreen id={id ?? ''} />;
}
