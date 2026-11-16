import type { MeetingPlatform } from '../../common/types/api.types';

export interface DetectedMeeting {
  platform: MeetingPlatform;
  url: string;
}

export interface CalendarEventLike {
  hangoutLink?: string | null;
  location?: string | null;
  description?: string | null;
  conferenceData?: {
    entryPoints?: { entryPointType?: string | null; uri?: string | null }[] | null;
    conferenceSolution?: { key?: { type?: string | null } | null } | null;
  } | null;
}

const PATTERNS: { platform: MeetingPlatform; re: RegExp }[] = [
  {
    platform: 'google_meet',
    re: /https?:\/\/meet\.google\.com\/(?:meet\/)?[a-z]{3,4}-[a-z]{4}-[a-z]{3,4}(?:\?[^\s<>"')]*)?/i,
  },
  { platform: 'google_meet', re: /https?:\/\/meet\.google\.com\/lookup\/[\w-]+(?:\?[^\s<>"')]*)?/i },
  { platform: 'zoom', re: /https?:\/\/(?:[\w-]+\.)?zoom\.us\/(?:j|my|w|s)\/[^\s<>"')]+/i },
  { platform: 'zoom', re: /https?:\/\/(?:[\w-]+\.)?zoomgov\.com\/j\/[^\s<>"')]+/i },
  { platform: 'teams', re: /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"')]+/i },
  { platform: 'teams', re: /https?:\/\/teams\.live\.com\/meet\/[^\s<>"')]+/i },
];

export const MEET_URL_RE = /^https:\/\/meet\.google\.com\/(?:meet\/)?[a-z]{3,4}-[a-z]{4}-[a-z]{3,4}(?:[/?#].*)?$/i;

export function platformForUrl(url: string): MeetingPlatform {
  for (const p of PATTERNS) if (p.re.test(url)) return p.platform;
  return 'other';
}

export function isGoogleMeetUrl(url: string): boolean {
  return MEET_URL_RE.test(url.trim());
}

function stripHtml(text: string): string {
  return text
    .replace(/<a [^>]*href="([^"]+)"[^>]*>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&');
}

/**
 * Finds the video-call link of a calendar event: Meet `hangoutLink`, then conferenceData video
 * entry points, then Meet/Zoom/Teams URLs in location or description.
 */
export function detectMeetingLink(event: CalendarEventLike): DetectedMeeting | null {
  if (event.hangoutLink) {
    const platform = platformForUrl(event.hangoutLink);
    return { platform: platform === 'other' ? 'google_meet' : platform, url: event.hangoutLink };
  }
  const video = event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video' && e.uri);
  if (video?.uri) {
    const solution = event.conferenceData?.conferenceSolution?.key?.type ?? '';
    let platform = platformForUrl(video.uri);
    if (platform === 'other' && solution === 'hangoutsMeet') platform = 'google_meet';
    return { platform, url: video.uri };
  }
  const haystack = [event.location ?? '', stripHtml(event.description ?? '')].join('\n');
  for (const p of PATTERNS) {
    const m = p.re.exec(haystack);
    if (m) return { platform: p.platform, url: m[0].replace(/[.,;]+$/, '') };
  }
  return null;
}
