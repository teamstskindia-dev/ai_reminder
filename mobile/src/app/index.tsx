import { Redirect } from 'expo-router';

import { useHomeRoute } from '@/features/navigation/tabs';
import { useAuth } from '@/providers/AuthProvider';
import { useOnboarding } from '@/providers/OnboardingProvider';

/** Entry route: sends the user to the right place for their session state. */
export default function Index() {
  const { status, needsSetup } = useAuth();
  const { seen } = useOnboarding();
  const homeRoute = useHomeRoute();
  if (status === 'signedIn') return <Redirect href={needsSetup ? '/setup' : homeRoute} />;
  return <Redirect href={seen ? '/login' : '/onboarding'} />;
}
