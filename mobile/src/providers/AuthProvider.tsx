import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { sessionExpiredEvents } from '@/api/events';
import { qk } from '@/api/queryKeys';
import { fetchAuthMe, logout, updateMe } from '@/api/resources/auth';
import { clearTokens, getRefreshToken, loadTokens, setTokens } from '@/api/tokens';
import type { AuthMe, User, UserSettings } from '@/api/types';
import { cancelPendingSignIn, exchangeWithPkce } from '@/features/auth/google';
import { forgetPushToken, unregisterPushToken } from '@/features/push/registration';
import { reportError } from '@/utils/logger';
import { clearUserScopedStorage } from '@/utils/storage';
import { toast } from '@/utils/toast';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  settings: UserSettings | null;
  /** Exchanges a one-time OAuth code for tokens (safe to call twice with the same code). */
  completeSignIn: (code: string) => Promise<{ isNewUser: boolean }>;
  /** Signs out. `localOnly` skips server calls (e.g. after the account was deleted). */
  signOut: (options?: { localOnly?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const statusRef = useRef<AuthStatus>('loading');

  const applyStatus = useCallback((next: AuthStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadTokens().then((tokens) => {
      if (cancelled) return;
      applyStatus(tokens.refreshToken || tokens.accessToken ? 'signedIn' : 'signedOut');
    });
    return () => {
      cancelled = true;
    };
  }, [applyStatus]);

  const me = useQuery({
    queryKey: qk.me,
    queryFn: fetchAuthMe,
    enabled: status === 'signedIn',
    staleTime: 60_000,
  });

  // Once per signed-in user: fill in the device timezone if the account has none (or the UTC default),
  // so digests and reminders use local time, and record that onboarding happened.
  const profileSyncedFor = useRef<string | null>(null);
  const meUser = me.data?.user;
  useEffect(() => {
    if (!meUser || profileSyncedFor.current === meUser.id) return;
    profileSyncedFor.current = meUser.id;
    const patch: { timezone?: string; onboarded?: true } = {};
    const tz = deviceTimezone();
    if (tz && tz !== meUser.timezone && (!meUser.timezone || meUser.timezone === 'UTC')) patch.timezone = tz;
    if (!meUser.onboardedAt) patch.onboarded = true;
    if (!Object.keys(patch).length) return;
    updateMe(patch)
      .then((user) => queryClient.setQueryData<AuthMe>(qk.me, (prev) => (prev ? { ...prev, user } : prev)))
      .catch(() => undefined);
  }, [meUser, queryClient]);

  /** Drops the local session. Cached data is cleared after the navigator has left the private screens. */
  const resetLocalSession = useCallback(async () => {
    cancelPendingSignIn();
    await queryClient.cancelQueries();
    await clearTokens().catch((error: unknown) => reportError(error, { source: 'auth-clear-tokens' }));
    await clearUserScopedStorage();
    applyStatus('signedOut');
    setTimeout(() => queryClient.clear(), 400);
  }, [applyStatus, queryClient]);

  useEffect(
    () =>
      sessionExpiredEvents.subscribe(() => {
        if (statusRef.current !== 'signedIn') return;
        toast('Your session expired. Please sign in again.');
        void resetLocalSession();
      }),
    [resetLocalSession],
  );

  const completeSignIn = useCallback(
    async (code: string) => {
      const result = await exchangeWithPkce(code);
      // A second delivery of the same code resolves to the same tokens; storing them again is harmless.
      const previousRefresh = statusRef.current === 'signedIn' ? await getRefreshToken() : null;
      await setTokens(result.tokens);
      if (previousRefresh && previousRefresh !== result.tokens.refreshToken) {
        // Re-auth while signed in (e.g. reconnecting Google Calendar): retire the old session.
        void logout(previousRefresh).catch(() => undefined);
      }
      const previous = queryClient.getQueryData<AuthMe>(qk.me);
      if (previous) queryClient.setQueryData<AuthMe>(qk.me, { ...previous, user: result.user });
      applyStatus('signedIn');
      void queryClient.invalidateQueries({ queryKey: qk.me });
      void queryClient.invalidateQueries({ queryKey: qk.integrations });
      return { isNewUser: result.isNewUser };
    },
    [applyStatus, queryClient],
  );

  const signOut = useCallback(
    async (options?: { localOnly?: boolean }) => {
      if (options?.localOnly) {
        await forgetPushToken();
      } else {
        await unregisterPushToken();
        const refreshToken = await getRefreshToken();
        await logout(refreshToken).catch(() => undefined);
      }
      await resetLocalSession();
    },
    [resetLocalSession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: me.data?.user ?? null,
      settings: me.data?.settings ?? null,
      completeSignIn,
      signOut,
    }),
    [status, me.data, completeSignIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** The `GET /auth/me` query (user + settings) for screens that need loading/error states. */
export function useMeQuery() {
  const { status } = useAuth();
  return useQuery({ queryKey: qk.me, queryFn: fetchAuthMe, enabled: status === 'signedIn', staleTime: 60_000 });
}
