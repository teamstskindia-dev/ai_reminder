"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Banner, BannerPlacement, FeatureKey, NavLocation, PublicConfig } from "@/lib/api/types";
import { DEFAULT_CONFIG } from "@/lib/config/defaults";

const ConfigContext = createContext<PublicConfig>(DEFAULT_CONFIG);

/** Exposes the server-fetched public config (branding, theme, features, navigation, banners) to client components. */
export function ConfigProvider({ config, children }: { config: PublicConfig; children: ReactNode }) {
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export function useConfig(): PublicConfig {
  return useContext(ConfigContext);
}

export function useBranding() {
  return useConfig().branding;
}

export function useFeature(key: FeatureKey): boolean {
  return useConfig().features[key] ?? false;
}

export function useNavigation(location: NavLocation) {
  return useConfig().navigation[location] ?? [];
}

export function useBanners(placement: BannerPlacement): Banner[] {
  return useConfig().banners.filter((b) => b.placement === placement);
}
