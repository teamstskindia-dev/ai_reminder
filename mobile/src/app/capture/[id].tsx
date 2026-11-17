import { useLocalSearchParams } from 'expo-router';

import { CaptureScreen } from '@/features/capture/CaptureScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/RouteErrorBoundary';

export default function CaptureRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CaptureScreen id={id ?? ''} />;
}
