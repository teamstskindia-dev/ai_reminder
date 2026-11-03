import * as Linking from 'expo-linking';
import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import type { FeatureKey } from '@/api/types';

import { reportError } from './logger';
import { safeUrl } from './safeUrl';
import { toast } from './toast';

/** Opens a vetted https URL in the in-app browser (SFSafariViewController / Custom Tabs). */
export async function openExternal(url: string): Promise<void> {
  const target = safeUrl(url);
  if (!target || target.kind !== 'external') return;
  try {
    await WebBrowser.openBrowserAsync(target.url, { enableBarCollapsing: true });
  } catch (error) {
    reportError(error, { source: 'open-browser' });
    toast("Couldn't open this link.");
  }
}

const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/;

/** Opens the mail app for a validated address (e.g. the configured support email). */
export async function openMail(address: string): Promise<void> {
  if (!EMAIL_RE.test(address)) return;
  try {
    await Linking.openURL(`mailto:${address}`);
  } catch {
    toast("Couldn't open your email app.");
  }
}

/** Whether a content link would do anything (used to hide CTAs with unsafe/unknown targets). */
export function isOpenableLink(url: string | null | undefined): boolean {
  return safeUrl(url) !== null;
}

/**
 * Opens any link from content (banners, markdown, notifications) through the allowlist: internal routes
 * navigate in-app (respecting feature flags), https opens the browser, everything else is ignored.
 */
export async function openLink(url: string, isEnabled?: (feature: FeatureKey) => boolean): Promise<void> {
  const target = safeUrl(url);
  if (!target) return;
  if (target.kind === 'external') {
    await openExternal(target.url);
    return;
  }
  if (target.feature && isEnabled && !isEnabled(target.feature)) {
    toast("This feature isn't available right now.");
    return;
  }
  router.push(target.path as Href);
}
