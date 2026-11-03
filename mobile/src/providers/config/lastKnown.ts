import type { PublicConfig } from '@/api/types';

import { DEFAULT_CONFIG } from './defaultConfig';

/**
 * The most recently applied config, readable outside React (e.g. by the root error boundary, which
 * renders outside every provider). Holds only public, non-sensitive config.
 */
let lastKnown: PublicConfig = DEFAULT_CONFIG;

export function setLastKnownConfig(config: PublicConfig): void {
  lastKnown = config;
}

export function getLastKnownConfig(): PublicConfig {
  return lastKnown;
}
