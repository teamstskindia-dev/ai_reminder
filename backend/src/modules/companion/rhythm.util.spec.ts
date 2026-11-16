import { checkinPush, dayHeadline, recapHeadline, tomorrowLine } from './companion.copy';
import {
  addDays,
  atLocalTime,
  dayKey,
  dueDay,
  inQuietHours,
  isDue,
  minutesSince,
  nextWarmth,
  stageFor,
  toMinutes,
  weekStartOf,
} from './rhythm.util';

const IST = 'Asia/Kolkata';

describe('rhythm.util', () => {
  it('parses HH:MM', () => {
    expect(toMinutes('07:30')).toBe(450);
    expect(toMinutes('23:59')).toBe(1439);
    expect(toMinutes('24:00')).toBeNull();
    expect(toMinutes('7:30')).toBeNull();
  });

  it('wraps minutesSince at midnight', () => {
    expect(minutesSince(5, 1435)).toBe(10);
    expect(minutesSince(450, 450)).toBe(0);
  });

  it('is due only inside the window after the target', () => {
    expect(isDue(450, '07:30')).toBe(true);
    expect(isDue(464, '07:30')).toBe(true);
    expect(isDue(465, '07:30')).toBe(false);
    expect(isDue(449, '07:30')).toBe(false);
    expect(isDue(5, '23:55')).toBe(true);
  });

  it('handles quiet hours that wrap midnight', () => {
    expect(inQuietHours(23 * 60, '22:30', '07:00')).toBe(true);
    expect(inQuietHours(6 * 60, '22:30', '07:00')).toBe(true);
    expect(inQuietHours(12 * 60, '22:30', '07:00')).toBe(false);
    expect(inQuietHours(13 * 60, '13:00', '14:00')).toBe(true);
    expect(inQuietHours(13 * 60, '13:00', '13:00')).toBe(false);
  });

  it('builds a UTC instant for a local time', () => {
    expect(atLocalTime('2026-11-14', IST, '07:30').toISOString()).toBe('2026-11-14T02:00:00.000Z');
    expect(atLocalTime('2026-11-14', 'UTC', '21:00').toISOString()).toBe('2026-11-14T21:00:00.000Z');
  });

  it('keeps a 23:55 target on the day it belongs to', () => {
    const justAfterMidnight = new Date('2026-11-14T18:35:00.000Z'); // 00:05 IST on Nov 15
    expect(dayKey(justAfterMidnight, IST)).toBe('2026-11-15');
    expect(dueDay(justAfterMidnight, IST, '23:55')).toBe('2026-11-14');
    expect(dueDay(justAfterMidnight, IST, '00:00')).toBe('2026-11-15');
  });

  it('finds the Monday of a week', () => {
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09'); // Sunday
    expect(weekStartOf('2026-11-09')).toBe('2026-11-09'); // Monday
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });

  it('grows warmth with conversations and maps it to a stage', () => {
    expect(nextWarmth(0, 'completed', true)).toBe(5);
    expect(nextWarmth(0, 'missed', false)).toBe(0);
    expect(nextWarmth(100, 'completed', true)).toBe(100);
    expect(stageFor(29)).toBe(1);
    expect(stageFor(30)).toBe(2);
    expect(stageFor(70)).toBe(3);
  });
});

describe('companion copy', () => {
  it('writes the day headline in English and Hinglish', () => {
    const day = { meetings: 3, firstMeetingAt: '10:00 AM', reminders: 2, openItems: 4 };
    expect(dayHeadline('english', day)).toBe('3 meetings today (first at 10:00 AM), 2 reminders and 4 open to-dos.');
    expect(dayHeadline('hinglish', day)).toBe('Aaj 3 meetings (pehli 10:00 AM pe), 2 reminders aur 4 to-dos pending.');
    expect(dayHeadline('hinglish', { ...day, openItems: 0 })).toBe(
      'Aaj 3 meetings (pehli 10:00 AM pe) aur 2 reminders hain.',
    );
    expect(dayHeadline('english', { meetings: 0, firstMeetingAt: null, reminders: 0, openItems: 0 })).toContain(
      'clear',
    );
  });

  it('wraps up with tomorrow and what is still open', () => {
    const tomorrow = { meetings: 1, firstMeetingAt: '9:00 AM', reminders: 0, openItems: 2 };
    expect(tomorrowLine('english', tomorrow, 2)).toBe(
      "Here's tomorrow: 1 meeting (first at 9:00 AM). 2 things are still open.",
    );
    expect(tomorrowLine('mixed', tomorrow, 1)).toBe(
      'Kal ka plan: 1 meeting (pehli 9:00 AM pe). 1 cheez abhi bhi open hai.',
    );
  });

  it('asks more lightly after a missed check-in', () => {
    expect(checkinPush('english', 'Asha', 'normal').title).toBe('How did today go, Asha?');
    expect(checkinPush('english', 'Asha', 'light').body).toContain('No pressure');
  });

  it('writes a recap headline without zero counts', () => {
    expect(recapHeadline(4, 6)).toBe('4 meetings, 6 promises kept');
    expect(recapHeadline(0, 1)).toBe('1 promise kept');
    expect(recapHeadline(0, 0)).toBe('A quiet week');
  });
});
