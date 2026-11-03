import type { ErrorBoundaryProps } from 'expo-router';

import { ErrorFallback } from './ErrorFallback';

/** Re-exported as `ErrorBoundary` by route files that should contain their own crashes. */
export function RouteErrorBoundary(props: ErrorBoundaryProps) {
  return <ErrorFallback {...props} scope="screen" />;
}
