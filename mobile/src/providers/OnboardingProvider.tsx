import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { StorageKeys } from '@/utils/storage';

interface OnboardingContextValue {
  ready: boolean;
  seen: boolean;
  markSeen: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ ready: false, seen: false });

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(StorageKeys.onboardingSeen)
      .then((value) => {
        if (!cancelled) setState({ ready: true, seen: value === '1' });
      })
      .catch(() => {
        if (!cancelled) setState({ ready: true, seen: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const markSeen = useCallback(() => {
    setState({ ready: true, seen: true });
    AsyncStorage.setItem(StorageKeys.onboardingSeen, '1').catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ ...state, markSeen }), [state, markSeen]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('useOnboarding must be used inside <OnboardingProvider>');
  return value;
}
