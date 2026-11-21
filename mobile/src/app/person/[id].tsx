import { useLocalSearchParams } from 'expo-router';

import { PersonScreen } from '@/features/memory/PersonScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/RouteErrorBoundary';

export default function PersonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PersonScreen id={id ?? ''} />;
}
