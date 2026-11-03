import { CaptionAggregator, mergeCaption } from './caption-aggregator';

const T0 = 1_000_000;

function make(
  opts: Partial<{
    idleMs: number;
    maxSegmentMs: number;
    startSeq: number;
  }> = {},
) {
  return new CaptionAggregator({ meetingStartMs: T0, idleMs: 3000, ...opts });
}

describe('mergeCaption', () => {
  it('treats a growing caption as a replacement', () => {
    expect(mergeCaption('Hello every', 'Hello everyone, welcome')).toEqual({
      kind: 'replace',
      text: 'Hello everyone, welcome',
    });
  });

  it('accepts tail revisions when most of the prefix matches', () => {
    expect(mergeCaption('we should ship the new on boarding', 'we should ship the new onboarding flow')).toEqual({
      kind: 'replace',
      text: 'we should ship the new onboarding flow',
    });
  });

  it('appends only new words for a rolling window overlap', () => {
    const prev = 'so the plan for next quarter is to focus on the mobile app';
    const next = 'focus on the mobile app and the reminders feature';
    expect(mergeCaption(prev, next)).toEqual({
      kind: 'append',
      text: 'so the plan for next quarter is to focus on the mobile app and the reminders feature',
    });
  });

  it('ignores stale shorter replays', () => {
    expect(mergeCaption('Hello everyone, welcome to the call', 'Hello everyone')).toEqual({ kind: 'same' });
  });

  it('detects unrelated text', () => {
    expect(mergeCaption('Thanks for joining today', 'Next item is the budget')).toEqual({ kind: 'new' });
  });

  it('ignores punctuation and case when comparing', () => {
    expect(mergeCaption('okay so', 'Okay, so let us start')).toEqual({
      kind: 'replace',
      text: 'Okay, so let us start',
    });
  });
});

describe('CaptionAggregator', () => {
  it('merges progressive growth into one segment', () => {
    const agg = make();
    agg.push('Alice', 'Hi', T0 + 1000);
    agg.push('Alice', 'Hi every', T0 + 1300);
    agg.push('Alice', 'Hi everyone, thanks for', T0 + 1800);
    agg.push('Alice', 'Hi everyone, thanks for joining.', T0 + 2400);
    expect(agg.flushIdle(T0 + 3000)).toEqual([]);
    const out = agg.flushIdle(T0 + 6000);
    expect(out).toEqual([
      {
        seq: 0,
        speaker: 'Alice',
        text: 'Hi everyone, thanks for joining.',
        startMs: 1000,
        endMs: 2400,
      },
    ]);
  });

  it('applies revisions of the tail of the caption', () => {
    const agg = make();
    agg.push('Bob', 'I will send the deck by fry', T0 + 500);
    agg.push('Bob', 'I will send the deck by Friday', T0 + 900);
    expect(agg.drain(T0 + 1000)).toEqual([
      {
        seq: 0,
        speaker: 'Bob',
        text: 'I will send the deck by Friday',
        startMs: 500,
        endMs: 900,
      },
    ]);
  });

  it('handles the rolling caption window without duplicating words', () => {
    const agg = make();
    agg.push('Carol', 'so the plan for next quarter is to focus on the mobile app', T0 + 1000);
    agg.push('Carol', 'focus on the mobile app and the reminders feature', T0 + 2000);
    const [seg] = agg.drain(T0 + 2500);
    expect(seg.text).toBe('so the plan for next quarter is to focus on the mobile app and the reminders feature');
  });

  it('starts a new segment when the speaker changes', () => {
    const agg = make();
    agg.push('Alice', 'What do you think?', T0 + 1000);
    agg.push('Bob', 'Looks good to me', T0 + 2000);
    const out = agg.drain(T0 + 3000);
    expect(out.map((s) => [s.seq, s.speaker, s.text])).toEqual([
      [0, 'Alice', 'What do you think?'],
      [1, 'Bob', 'Looks good to me'],
    ]);
  });

  it('keeps concurrent speakers in separate open segments', () => {
    const agg = make();
    agg.push('Alice', 'I think we', T0 + 1000);
    agg.push('Bob', 'Sorry to', T0 + 1100);
    agg.push('Alice', 'I think we should wait', T0 + 1200);
    agg.push('Bob', 'Sorry to interrupt', T0 + 1300);
    expect(agg.openCount).toBe(2);
    const out = agg.drain(T0 + 2000);
    expect(out.map((s) => s.text)).toEqual(['I think we should wait', 'Sorry to interrupt']);
  });

  it('starts a new segment for a new sentence block of the same speaker', () => {
    const agg = make();
    agg.push('Alice', 'First topic is hiring.', T0 + 1000);
    agg.push('Alice', 'Second, the budget review is next week.', T0 + 5000);
    const out = agg.drain(T0 + 6000);
    expect(out).toHaveLength(2);
    expect(out[1].text).toBe('Second, the budget review is next week.');
  });

  it('finalises only idle segments', () => {
    const agg = make({ idleMs: 2000 });
    agg.push('Alice', 'Done talking', T0 + 1000);
    agg.push('Bob', 'Still talking', T0 + 2500);
    const out = agg.flushIdle(T0 + 3500);
    expect(out.map((s) => s.speaker)).toEqual(['Alice']);
    expect(agg.openCount).toBe(1);
  });

  it('splits very long monologues and does not repeat already-emitted words', () => {
    const agg = make({ maxSegmentMs: 5000 });
    agg.push('Dan', 'one two three four five', T0 + 1000);
    agg.push('Dan', 'one two three four five six seven', T0 + 7000);
    const first = agg.flushIdle(T0 + 7100);
    expect(first.map((s) => s.text)).toEqual(['one two three four five six seven']);
    agg.push('Dan', 'one two three four five six seven eight nine', T0 + 8000);
    agg.push('Dan', 'one two three four five six seven eight nine ten', T0 + 8500);
    const rest = agg.drain(T0 + 9000);
    expect(rest).toEqual([
      {
        seq: 1,
        speaker: 'Dan',
        text: 'eight nine ten',
        startMs: 8000,
        endMs: 8500,
      },
    ]);
  });

  it('ignores late replays of an already finalised block', () => {
    const agg = make();
    agg.push('Eve', 'We agreed to launch on Monday', T0 + 1000);
    agg.flushIdle(T0 + 10_000);
    agg.push('Eve', 'We agreed to launch on Monday', T0 + 10_500);
    expect(agg.drain(T0 + 11_000)).toEqual([]);
  });

  it('assigns increasing seq ordered by start time, from startSeq', () => {
    const agg = make({ startSeq: 10 });
    agg.push('Bob', 'second', T0 + 2000);
    agg.push('Alice', 'first', T0 + 1000);
    const out = agg.drain(T0 + 3000);
    expect(out.map((s) => [s.seq, s.text])).toEqual([
      [10, 'first'],
      [11, 'second'],
    ]);
    agg.push('Carol', 'third', T0 + 4000);
    expect(agg.drain(T0 + 5000)[0].seq).toBe(12);
  });

  it('ignores empty text and normalises whitespace and speaker names', () => {
    const agg = make();
    agg.push('Alice', '   ', T0 + 1000);
    agg.push('  ', '  hello   there  ', T0 + 1500);
    const out = agg.drain(T0 + 2000);
    expect(out).toEqual([
      {
        seq: 0,
        speaker: 'Unknown',
        text: 'hello there',
        startMs: 1500,
        endMs: 1500,
      },
    ]);
  });

  it('never produces negative timestamps for captions before the reference time', () => {
    const agg = make();
    agg.push('Alice', 'early words', T0 - 5000);
    expect(agg.drain(T0)[0].startMs).toBe(0);
  });
});
