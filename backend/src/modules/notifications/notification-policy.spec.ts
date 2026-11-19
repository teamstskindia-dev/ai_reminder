import {
  bestHour,
  decidePush,
  ignoredHour,
  nextHour,
  nudgesPaused,
  PolicySettings,
  quietUntil,
  toEngagement,
} from './notification-policy';

const IST = 'Asia/Kolkata';
/** 2026-11-18 at HH:MM in India (UTC+5:30). */
const at = (hhmm: string) => new Date(`2026-11-18T${hhmm}:00+05:30`);

const base: PolicySettings = {
  quietHoursStart: '22:30',
  quietHoursEnd: '07:00',
  focusUntil: null,
  pushBudget: 3,
  criticalBreakThrough: false,
};

describe('notification policy', () => {
  it('knows when quiet hours end, across midnight', () => {
    expect(quietUntil(at('12:00'), IST, base)).toBeNull();
    expect(quietUntil(at('23:00'), IST, base)?.toISOString()).toBe(new Date('2026-11-19T07:00:00+05:30').toISOString());
    expect(quietUntil(at('05:00'), IST, base)?.toISOString()).toBe(new Date('2026-11-18T07:00:00+05:30').toISOString());
  });

  it('treats focus mode like quiet hours', () => {
    const focusUntil = at('15:00');
    expect(quietUntil(at('14:00'), IST, { ...base, focusUntil })?.getTime()).toBe(focusUntil.getTime());
    expect(quietUntil(at('16:00'), IST, { ...base, focusUntil })).toBeNull();
  });

  it('pushes critical alerts now, or holds them in quiet hours', () => {
    const day = { type: 'reminder' as const, priority: 'critical' as const, timezone: IST, sentToday: 99 };
    expect(decidePush({ ...day, now: at('12:00'), settings: base })).toEqual({ action: 'send' });
    expect(decidePush({ ...day, now: at('23:00'), settings: base })).toMatchObject({ action: 'hold' });
    expect(decidePush({ ...day, now: at('23:00'), settings: { ...base, criticalBreakThrough: true } })).toEqual({
      action: 'send',
    });
    expect(decidePush({ ...day, now: at('23:00'), settings: base, breakThrough: true })).toEqual({ action: 'send' });
  });

  it('bundles normal pushes in quiet hours and beyond the daily budget', () => {
    const n = { type: 'capture_ready' as const, priority: 'normal' as const, timezone: IST, settings: base };
    expect(decidePush({ ...n, now: at('12:00'), sentToday: 2 })).toEqual({ action: 'send' });
    expect(decidePush({ ...n, now: at('12:10'), sentToday: 3 })).toEqual({
      action: 'bundle',
      releaseAt: nextHour(at('12:10')),
      reason: 'budget',
    });
    expect(decidePush({ ...n, now: at('23:00'), sentToday: 0 })).toMatchObject({ action: 'bundle', reason: 'quiet' });
  });

  it('never counts scheduled pushes against the budget and never pushes low priority', () => {
    expect(
      decidePush({
        type: 'evening_checkin',
        priority: 'normal',
        timezone: IST,
        settings: base,
        now: at('21:00'),
        sentToday: 50,
      }),
    ).toEqual({ action: 'send' });
    expect(
      decidePush({
        type: 'daily_digest',
        priority: 'low',
        timezone: IST,
        settings: base,
        now: at('09:00'),
        sentToday: 0,
      }),
    ).toEqual({ action: 'none' });
  });

  it('pauses nudges only while the break lasts', () => {
    expect(nudgesPaused({ nudgesPausedUntil: null })).toBe(false);
    expect(nudgesPaused({ nudgesPausedUntil: at('12:00') }, at('11:00'))).toBe(true);
    expect(nudgesPaused({ nudgesPausedUntil: at('12:00') }, at('13:00'))).toBe(false);
  });

  it('learns which hours the user answers', () => {
    const e = toEngagement({ '9': [6, 0], '11': [5, 4], '15': [1, 1], junk: [1, 1], '30': [1, 1] });
    expect(Object.keys(e).sort()).toEqual(['11', '15', '9']);
    expect(bestHour(e)).toBe(11);
    expect(ignoredHour(e, 9)).toBe(true);
    expect(ignoredHour(e, 11)).toBe(false);
    expect(bestHour({})).toBeNull();
  });
});
