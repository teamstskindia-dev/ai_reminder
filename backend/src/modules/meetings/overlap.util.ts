/** Meetings without an end time count as 30 minutes long. */
export const DEFAULT_MEETING_MS = 30 * 60_000;
/** A meeting starting within this long after another one ends is "back-to-back". */
export const BACK_TO_BACK_MS = 15 * 60_000;

export interface TimedMeeting {
  id: string;
  startAt: Date;
  endAt: Date | null;
}

export function endOf(m: TimedMeeting): Date {
  return m.endAt && m.endAt.getTime() > m.startAt.getTime()
    ? m.endAt
    : new Date(m.startAt.getTime() + DEFAULT_MEETING_MS);
}

export function overlaps(a: TimedMeeting, b: TimedMeeting): boolean {
  return a.id !== b.id && a.startAt.getTime() < endOf(b).getTime() && b.startAt.getTime() < endOf(a).getTime();
}

/** Ids of meetings that overlap at least one other (double-booked). */
export function overlappingIds(meetings: TimedMeeting[]): string[] {
  return meetings.filter((m) => meetings.some((o) => overlaps(m, o))).map((m) => m.id);
}

/** The meeting that starts within BACK_TO_BACK_MS after `m` ends (and not overlapping it), if any. */
export function nextBackToBack<T extends TimedMeeting>(m: TimedMeeting, others: T[]): T | null {
  const end = endOf(m).getTime();
  return (
    others
      .filter((o) => o.id !== m.id && o.startAt.getTime() >= end && o.startAt.getTime() - end <= BACK_TO_BACK_MS)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0] ?? null
  );
}
