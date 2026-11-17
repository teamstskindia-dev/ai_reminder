/** Shorter than this (pauses excluded) is "too short": nothing to process. */
export const MIN_CAPTURE_MS = 1500;

/** "Conversation · 16 Nov, 2:05 pm" in the user's time zone. */
export function defaultCaptureTitle(at: Date, timezone: string): string {
  let when: string;
  try {
    when = new Intl.DateTimeFormat('en-IN', {
      timeZone: timezone,
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(at);
  } catch {
    when = at.toISOString().slice(0, 16).replace('T', ' ');
  }
  return `Conversation · ${when}`;
}
