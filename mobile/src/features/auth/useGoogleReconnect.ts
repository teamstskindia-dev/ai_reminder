import { useState } from 'react';

import { useAuth } from '@/providers/AuthProvider';
import { useBranding } from '@/providers/config/ConfigProvider';
import { toast } from '@/utils/toast';

import { openGoogleSignIn, signInErrorMessage, signInFailureMessage } from './google';

/** Re-runs the Google OAuth flow while signed in (contract: reconnecting Calendar restarts /auth/google). */
export function useGoogleReconnect() {
  const { completeSignIn } = useAuth();
  const branding = useBranding();
  const [pending, setPending] = useState(false);

  const reconnect = async () => {
    setPending(true);
    try {
      const result = await openGoogleSignIn();
      if (result.type === 'cancelled') return;
      if (result.type === 'error') {
        toast(signInErrorMessage(result.error, branding));
        return;
      }
      await completeSignIn(result.code);
      toast('Google Calendar reconnected');
    } catch (error) {
      toast(signInFailureMessage(error));
    } finally {
      setPending(false);
    }
  };

  return { reconnect, pending };
}
