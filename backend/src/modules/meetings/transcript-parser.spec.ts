import {
  detectTranscriptFormat,
  mergeConsecutive,
  ParsedSegment,
  parseSrt,
  parseTimestamp,
  parseTranscript,
  parseTxt,
  parseVtt,
  splitSpeaker,
} from './transcript-parser';

describe('parseTimestamp', () => {
  it.each([
    ['00:01:02.500', 62_500],
    ['00:01:02,500', 62_500],
    ['1:02:03,250', 3_723_250],
    ['01:02.5', 62_500],
    ['01:02', 62_000],
    ['75:03', 4_503_000],
    ['00:00:00.000', 0],
    ['  00:00:05.1  ', 5_100],
  ])('%s → %d ms', (value, ms) => {
    expect(parseTimestamp(value)).toBe(ms);
  });

  it.each(['abc', '00:00:61', '1:2', '', '00-00-01'])('rejects %p', (value) => {
    expect(parseTimestamp(value)).toBeNull();
  });
});

describe('splitSpeaker', () => {
  it('splits a short name prefix', () => {
    expect(splitSpeaker('Priya Sharma: Let us begin')).toEqual({
      speaker: 'Priya Sharma',
      text: 'Let us begin',
    });
  });

  it('does not treat sentences or numbers as speakers', () => {
    expect(splitSpeaker('We met at noon. Agenda: roadmap').speaker).toBeNull();
    expect(splitSpeaker('10: items left').speaker).toBeNull();
    expect(splitSpeaker('One two three four five: words').speaker).toBeNull();
    expect(splitSpeaker('No colon here')).toEqual({
      speaker: null,
      text: 'No colon here',
    });
  });
});

describe('parseVtt', () => {
  const vtt = [
    'WEBVTT',
    '',
    'NOTE This is a comment',
    'spanning two lines',
    '',
    '1',
    '00:00:01.000 --> 00:00:04.000',
    '<v Alice>Hello everyone, welcome.</v>',
    '',
    '2',
    '00:00:04.500 --> 00:00:07.000',
    "<v Alice>Let's start with the roadmap.</v>",
    '',
    '00:00:08.000 --> 00:00:10.000 align:start position:10%',
    '<v.loud Bob>Sounds <i>good</i> to <c.yellow>me</c>.',
    '',
    '00:00:40.000 --> 00:00:42.000',
    'Bob: Second point here.',
    '',
  ].join('\n');

  it('parses voice tags, cue ids, inline tags and "Name: text" prefixes, merging same-speaker cues', () => {
    expect(parseVtt(vtt)).toEqual<ParsedSegment[]>([
      {
        speaker: 'Alice',
        text: "Hello everyone, welcome. Let's start with the roadmap.",
        startMs: 1000,
        endMs: 7000,
      },
      {
        speaker: 'Bob',
        text: 'Sounds good to me.',
        startMs: 8000,
        endMs: 10_000,
      },
      {
        speaker: 'Bob',
        text: 'Second point here.',
        startMs: 40_000,
        endMs: 42_000,
      },
    ]);
  });

  it('carries the previous speaker and labels the first anonymous cue Unknown', () => {
    const out = parseVtt(
      [
        'WEBVTT',
        '',
        '00:00:00.000 --> 00:00:01.000',
        'Intro music',
        '',
        '00:00:05.000 --> 00:00:06.000',
        '<v Mei>Hi</v>',
        '',
        '00:00:20.000 --> 00:00:21.000',
        'and welcome',
      ].join('\n'),
    );
    expect(out.map((s) => s.speaker)).toEqual(['Unknown', 'Mei', 'Mei']);
  });

  it('joins multi-line cue text and decodes entities', () => {
    const [seg] = parseVtt(['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', 'Tom &amp; Jerry', 'are here'].join('\n'));
    expect(seg.text).toBe('Tom & Jerry are here');
  });

  it('handles CRLF line endings and a BOM', () => {
    const out = parseVtt('﻿WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\n<v A>One</v>\r\n');
    expect(out).toEqual([{ speaker: 'A', text: 'One', startMs: 1000, endMs: 2000 }]);
  });

  it('skips blocks without a timing line and empty cues', () => {
    const out = parseVtt(
      ['WEBVTT', '', 'STYLE', '::cue { color: red }', '', '00:00:01.000 --> 00:00:02.000', ''].join('\n'),
    );
    expect(out).toEqual([]);
  });
});

describe('parseSrt', () => {
  const srt = [
    '1',
    '00:00:01,000 --> 00:00:03,000',
    'Alice: Good morning.',
    '',
    '2',
    '00:00:03,500 --> 00:00:05,000',
    'How are you?',
    '',
    '3',
    '00:00:06,000 --> 00:00:08,000',
    'Bob: Great,',
    'thanks.',
    '',
  ].join('\n');

  it('parses cues, carries speakers and merges consecutive cues', () => {
    expect(parseSrt(srt)).toEqual<ParsedSegment[]>([
      {
        speaker: 'Alice',
        text: 'Good morning. How are you?',
        startMs: 1000,
        endMs: 5000,
      },
      { speaker: 'Bob', text: 'Great, thanks.', startMs: 6000, endMs: 8000 },
    ]);
  });

  it('works with CRLF', () => {
    expect(parseSrt(srt.replace(/\n/g, '\r\n'))).toHaveLength(2);
  });
});

describe('parseTxt', () => {
  it('parses "[mm:ss] Speaker: text" and "(hh:mm:ss) Speaker: text" lines', () => {
    const out = parseTxt(
      ['[00:05] Alice: Let us begin.', '[01:10] Bob: I have an update.', '(00:02:30) Alice: Thanks Bob.'].join('\n'),
    );
    expect(out.map(({ speaker, startMs }) => ({ speaker, startMs }))).toEqual([
      { speaker: 'Alice', startMs: 5000 },
      { speaker: 'Bob', startMs: 70_000 },
      { speaker: 'Alice', startMs: 150_000 },
    ]);
    expect(out[0].text).toBe('Let us begin.');
    // end = min(next start, start + words * 400ms)
    expect(out[0].endMs).toBe(5000 + 3 * 400);
    expect(out[1].endMs).toBe(70_000 + 4 * 400);
    expect(out[2].endMs).toBe(150_000 + 2 * 400);
  });

  it('accepts bare "mm:ss Speaker:" and dashed timestamps', () => {
    const out = parseTxt('00:05 Alice: hi\n00:07 - Bob: hello');
    expect(out.map((s) => [s.speaker, s.startMs, s.text])).toEqual([
      ['Alice', 5000, 'hi'],
      ['Bob', 7000, 'hello'],
    ]);
  });

  it('estimates timings for "Speaker: text" lines without timestamps', () => {
    const out = parseTxt('Alice: one two three four five\nBob: six seven');
    expect(out).toEqual<ParsedSegment[]>([
      {
        speaker: 'Alice',
        text: 'one two three four five',
        startMs: 0,
        endMs: 2000,
      },
      { speaker: 'Bob', text: 'six seven', startMs: 2000, endMs: 2800 },
    ]);
  });

  it('labels leading plain lines Unknown and carries the last speaker', () => {
    const out = parseTxt('Hello there\nAlice: Hi\nHow are you\n\n');
    expect(out.map((s) => s.speaker)).toEqual(['Unknown', 'Alice', 'Alice']);
    expect(out[2].text).toBe('How are you');
  });

  it('handles CRLF line endings and a BOM', () => {
    const out = parseTxt('﻿[00:01] Alice: Hi\r\n[00:02] Bob: Yo\r\n');
    expect(out.map((s) => [s.speaker, s.text, s.startMs])).toEqual([
      ['Alice', 'Hi', 1000],
      ['Bob', 'Yo', 2000],
    ]);
  });

  it('returns no segments for empty input', () => {
    expect(parseTxt('')).toEqual([]);
    expect(parseTxt('\n \n')).toEqual([]);
  });
});

describe('detectTranscriptFormat / parseTranscript', () => {
  it.each([
    ['meeting.vtt', '', 'vtt'],
    ['MEETING.VTT', '', 'vtt'],
    ['notes.txt', 'WEBVTT\n\n', 'vtt'],
    ['notes.txt', '﻿WEBVTT\n\n', 'vtt'],
    ['subs.srt', '1\n00:00:01,000 --> 00:00:02,000\nhi', 'srt'],
    ['notes.txt', 'Alice: hi', 'txt'],
    ['upload', 'plain', 'txt'],
  ])('%s → %s', (filename, content, format) => {
    expect(detectTranscriptFormat(filename, content)).toBe(format);
  });

  it('dispatches to the right parser', () => {
    expect(parseTranscript('Alice: hi', 'txt')[0].speaker).toBe('Alice');
    expect(parseTranscript('1\n00:00:01,000 --> 00:00:02,000\nBob: hi', 'srt')[0].speaker).toBe('Bob');
    expect(parseTranscript('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Mei>hi', 'vtt')[0].speaker).toBe('Mei');
  });
});

describe('mergeConsecutive', () => {
  const seg = (speaker: string, startMs: number, endMs: number | null, text = 'x'): ParsedSegment => ({
    speaker,
    text,
    startMs,
    endMs,
  });

  it('merges same speaker within the gap and duration limits', () => {
    expect(mergeConsecutive([seg('A', 0, 1000, 'a'), seg('A', 2500, 3000, 'b')])).toEqual([seg('A', 0, 3000, 'a b')]);
  });

  it('does not merge when the gap is too large', () => {
    expect(mergeConsecutive([seg('A', 0, 1000), seg('A', 3001, 4000)])).toHaveLength(2);
  });

  it('does not merge when the merged segment would exceed the max duration', () => {
    expect(mergeConsecutive([seg('A', 0, 20_000), seg('A', 20_500, 31_000)])).toHaveLength(2);
  });

  it('does not merge different speakers', () => {
    expect(mergeConsecutive([seg('A', 0, 1000), seg('B', 1000, 2000)])).toHaveLength(2);
  });

  it('respects custom limits', () => {
    expect(mergeConsecutive([seg('A', 0, 1000), seg('A', 1500, 2000)], 100)).toHaveLength(2);
    expect(mergeConsecutive([seg('A', 0, 1000), seg('A', 1000, 2000)], 2000, 1500)).toHaveLength(2);
  });

  it('keeps the previous end when the merged cue has no end time', () => {
    expect(mergeConsecutive([seg('A', 0, 1000, 'a'), seg('A', 1500, null, 'b')])).toEqual([seg('A', 0, 1000, 'a b')]);
  });

  it('does not mutate its input', () => {
    const input = [seg('A', 0, 1000, 'a'), seg('A', 1500, 2000, 'b')];
    const copy = JSON.parse(JSON.stringify(input)) as ParsedSegment[];
    mergeConsecutive(input);
    expect(input).toEqual(copy);
  });
});
