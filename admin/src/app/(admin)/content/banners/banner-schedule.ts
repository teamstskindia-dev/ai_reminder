import type { AdminBanner } from '@/lib/api/types';

export type ScheduleState = 'inactive' | 'scheduled' | 'live' | 'expired';

export function scheduleState(banner: Pick<AdminBanner, 'isActive' | 'startsAt' | 'endsAt'>, now: number) {
  const starts = banner.startsAt ? Date.parse(banner.startsAt) : null;
  const ends = banner.endsAt ? Date.parse(banner.endsAt) : null;
  if (!banner.isActive) return { status: 'inactive' as ScheduleState, label: 'Inactive' };
  if (starts !== null && starts > now) return { status: 'scheduled' as ScheduleState, label: 'Scheduled' };
  if (ends !== null && ends < now) return { status: 'expired' as ScheduleState, label: 'Expired' };
  if (starts === null && ends === null) return { status: 'live' as ScheduleState, label: 'Always on' };
  return { status: 'live' as ScheduleState, label: 'Live' };
}

export const PLACEMENT_LABELS = {
  dashboard: 'Web dashboard',
  landing_top: 'Landing page top bar',
  mobile_home: 'Mobile home',
} as const;

export const PLATFORM_LABELS = { web: 'Web', mobile: 'Mobile', all: 'Web + mobile' } as const;
export const VARIANT_LABELS = { info: 'Info', success: 'Success', warning: 'Warning', promo: 'Promo' } as const;

/** Placement/platform combinations that will never render. */
export function placementWarning(platform: AdminBanner['platform'], placement: AdminBanner['placement']): string | null {
  if (placement === 'mobile_home' && platform === 'web') {
    return 'Mobile home banners are only shown in the Android app — set the platform to Mobile or Web + mobile.';
  }
  if ((placement === 'dashboard' || placement === 'landing_top') && platform === 'mobile') {
    return `${PLACEMENT_LABELS[placement]} banners are only shown on the website — set the platform to Web or Web + mobile.`;
  }
  return null;
}
