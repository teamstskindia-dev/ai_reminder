import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { sessionExpiredEvents } from '@/api/events';
import { qk } from '@/api/queryKeys';
import { appleSignIn, fetchAuthMe, logout, updateMe, verifyEmailSignIn } from '@/api/resources/auth';
import { completeOnboarding } from '@/api/resources/onboarding';
import { clearTokens, getRefreshToken, loadTokens, setTokens } from '@/api/tokens';
import type { AuthMe, ExchangeResult, User, UserSettings } from '@/api/types';
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
  /** True once the signed-in user has loaded (or failed to load) — gates the first navigation. */
  userResolved: boolean;
  /** Signed in but first-run setup (user-flow §02) is not finished yet. */
  needsSetup: boolean;
  /** Exchanges a one-time OAuth code for tokens (safe to call twice with the same code). */
  completeSignIn: (code: string) => Promise<{ isNewUser: boolean }>;
  /** Verifies an emailed 6-digit code and signs in. */
  completeEmailSignIn: (email: string, code: string) => Promise<{ isNewUser: boolean }>;
  /** Signs in with an Apple identity token (iOS). */
  completeAppleSignIn: (input: { identityToken: string; givenName?: string; familyName?: string }) => Promise<{ isNewUser: boolean }>;
  /** Finishes first-run setup (stamps onboardedAt, sends the welcome email). */
  finishSetup: () => Promise<void>;
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
  // so the daily rhythm, digests and reminders use local time. Onboarding is finished by the setup flow.
  const profileSyncedFor = useRef<string | null>(null);
  const meUser = me.data?.user;
  useEffect(() => {
    if (!meUser || profileSyncedFor.current === meUser.id) return;
    profileSyncedFor.current = meUser.id;
    const tz = deviceTimezone();
    if (!tz || tz === meUser.timezone || (meUser.timezone && meUser.timezone !== 'UTC')) return;
    updateMe({ timezone: tz })
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

  /** Stores a fresh session (Google exchange or email code) and seeds the cached user. */
  const applySession = useCallback(
    async (result: ExchangeResult) => {
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

  const completeSignIn = useCallback(async (code: string) => applySession(await exchangeWithPkce(code)), [applySession]);

  const completeEmailSignIn = useCallback(
    async (email: string, code: string) => applySession(await verifyEmailSignIn(email, code)),
    [applySession],
  );

  const completeAppleSignIn = useCallback(
    async (input: { identityToken: string; givenName?: string; familyName?: string }) => applySession(await appleSignIn(input)),
    [applySession],
  );

  const finishSetup = useCallback(async () => {
    const user = await completeOnboarding();
    queryClient.setQueryData<AuthMe>(qk.me, (prev) => (prev ? { ...prev, user } : prev));
    void queryClient.invalidateQueries({ queryKey: qk.notifications.all });
  }, [queryClient]);

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

  const user = me.data?.user ?? null;
  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      settings: me.data?.settings ?? null,
      // Offline with no cached user: don't block the app on setup; it shows once the user loads.
      userResolved: status !== 'signedIn' || user !== null || me.isError || me.isPaused,
      needsSetup: status === 'signedIn' && user !== null && !user.onboardedAt,
      completeSignIn,
      completeEmailSignIn,
      completeAppleSignIn,
      finishSetup,
      signOut,
    }),
    [status, user, me.data?.settings, me.isError, me.isPaused, completeSignIn, completeEmailSignIn, completeAppleSignIn, finishSetup, signOut],
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
