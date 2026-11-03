import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { isApiError } from '@/api/errors';
import { maintenanceEvents } from '@/api/events';
import { queryClient } from '@/api/queryClient';
import { fetchPublicConfig } from '@/api/resources/public';
import type { FeatureKey, PublicConfig } from '@/api/types';
import { reportError } from '@/utils/logger';
import { readJson, StorageKeys, writeJson } from '@/utils/storage';

import { DEFAULT_CONFIG } from './defaultConfig';
import { setLastKnownConfig } from './lastKnown';
import { normalizeConfig } from './normalize';

export type ConfigSource = 'cache' | 'network' | 'defaults';

interface ConfigContextValue {
  config: PublicConfig;
  source: ConfigSource;
  /** True once the first config decision (cache, network or defaults) has been made. */
  ready: boolean;
  /** Maintenance from the config flag or from any API call answering 503 MAINTENANCE. */
  isMaintenance: boolean;
  maintenanceMessage: string;
  refreshing: boolean;
  /** Re-fetches the public config (ETag aware) and clears a forced maintenance state. */
  refresh: () => Promise<void>;
  isEnabled: (feature: FeatureKey) => boolean;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

interface State {
  config: PublicConfig;
  source: ConfigSource;
  ready: boolean;
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ config: DEFAULT_CONFIG, source: 'defaults', ready: false });
  const [forcedMaintenance, setForcedMaintenance] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const versionRef = useRef<string | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);

  /** Fetches and applies the latest config. Resolves true when the server answered. */
  const revalidate = useCallback((): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      try {
        const result = await fetchPublicConfig(versionRef.current);
        if (result.status === 'ok') {
          const next = normalizeConfig(result.config);
          if (next) {
            versionRef.current = next.version || null;
            setState({ config: next, source: 'network', ready: true });
            void writeJson(StorageKeys.config, next);
          }
        } else {
          setState((prev) => ({ ...prev, ready: true }));
        }
        return true;
      } catch (error) {
        // Offline is expected; anything else is worth knowing about. Never blocks the app.
        if (!(isApiError(error) && (error.isNetwork || error.code === 'MAINTENANCE'))) {
          reportError(error, { source: 'config-refresh' });
        }
        return false;
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, []);

  // Boot: cached config first (instant), then the network. Defaults only if both are unavailable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let cached = null;
      try {
        cached = normalizeConfig(await readJson<unknown>(StorageKeys.config));
      } catch (error) {
        reportError(error, { source: 'config-cache' });
      }
      if (cancelled) return;
      if (cached) {
        versionRef.current = cached.version || null;
        setState({ config: cached, source: 'cache', ready: true });
        void revalidate();
        return;
      }
      const ok = await revalidate();
      if (!cancelled && !ok) setState({ config: DEFAULT_CONFIG, source: 'defaults', ready: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [revalidate]);

  // Refetch whenever the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void revalidate();
    });
    return () => sub.remove();
  }, [revalidate]);

  // Any API call answering MAINTENANCE flips the app into the maintenance view.
  useEffect(
    () =>
      maintenanceEvents.subscribe(({ message }) => {
        setForcedMaintenance(message ?? '');
      }),
    [],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const ok = await revalidate();
      if (ok) {
        setForcedMaintenance(null);
        await queryClient.invalidateQueries();
      }
    } finally {
      setRefreshing(false);
    }
  }, [revalidate]);

  useEffect(() => {
    setLastKnownConfig(state.config);
  }, [state.config]);

  const value = useMemo<ConfigContextValue>(() => {
    const { config } = state;
    const isMaintenance = config.app.maintenanceMode || forcedMaintenance !== null;
    return {
      config,
      source: state.source,
      ready: state.ready,
      isMaintenance,
      maintenanceMessage: forcedMaintenance || config.app.maintenanceMessage,
      refreshing,
      refresh,
      isEnabled: (feature) => Boolean(config.features[feature]),
    };
  }, [state, forcedMaintenance, refreshing, refresh]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const value = useContext(ConfigContext);
  if (!value) throw new Error('useConfig must be used inside <ConfigProvider>');
  return value;
}

export function useBranding() {
  return useConfig().config.branding;
}

