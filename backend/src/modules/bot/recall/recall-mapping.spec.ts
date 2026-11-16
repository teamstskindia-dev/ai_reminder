import type { RecallBot } from '../../../infra/recall/recall.types';
import { SETTINGS_DEFAULTS } from '../../content/settings.defaults';
import type { BotSettings } from '../../content/settings.schemas';
import {
  analyseBot,
  buildCreateBotRequest,
  reasonForSubCode,
  statusesBefore,
  statusForEvent,
  transcriptToSegments,
} from './recall-mapping';

const BOT_ID = '6b2f3c1e-9a41-4f5e-8d2c-1a2b3c4d5e6f';
const bot = (changes: [string, string | null, string][], recordings: RecallBot['recordings'] = []): RecallBot => ({
  id: BOT_ID,
  status_changes: changes.map(([code, sub_code, created_at]) => ({ code, sub_code, created_at })),
  recordings,
});
const transcriptRecording = (code: string, url: string | null = 'https://files.example/t.json') => [
  {
    id: 'r1',
    status: { code: 'done' },
    media_shortcuts: { transcript: { id: 't1', status: { code }, data: { download_url: url } } },
  },
];

describe('buildCreateBotRequest', () => {
  const settings: BotSettings = { ...SETTINGS_DEFAULTS.bot, provider: 'recall' };

  it('maps bot settings to Recall.ai options and carries only the meeting id as metadata', () => {
    const body = buildCreateBotRequest({
      meetingId: 'm-1',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      botName: '  Remi Notetaker ',
      bot: { ...settings, waitingRoomTimeoutMinutes: 5, leaveWhenAloneMinutes: 2, maxDurationMinutes: 90 },
    });
    expect(body).toEqual({
      meeting_url: 'https://meet.google.com/abc-defg-hij',
      bot_name: 'Remi Notetaker',
      recording_config: {
        transcript: { provider: { recallai_streaming: { mode: 'prioritize_accuracy', language_code: 'auto' } } },
      },
      automatic_leave: {
        waiting_room_timeout: 300,
        noone_joined_timeout: 300,
        everyone_left_timeout: { timeout: 120 },
        in_call_recording_timeout: 5400,
      },
      metadata: { remi_meeting_id: 'm-1' },
    });
  });

  it("caps the waiting room at Google Meet's 10 minutes and treats leave-when-alone 0 as never", () => {
    const body = buildCreateBotRequest({
      meetingId: 'm-1',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      botName: 'x'.repeat(150),
      bot: { ...settings, waitingRoomTimeoutMinutes: 45, leaveWhenAloneMinutes: 0, maxDurationMinutes: 180 },
    });
    expect(body.automatic_leave.waiting_room_timeout).toBe(600);
    expect(body.automatic_leave.noone_joined_timeout).toBe(2700);
    expect(body.automatic_leave.everyone_left_timeout).toEqual({ timeout: 10_800 });
    expect(body.bot_name).toHaveLength(100);
  });

  it('uses Meet captions (language optional) when configured', () => {
    const captions = (languageCode: string) =>
      buildCreateBotRequest({
        meetingId: 'm',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        botName: 'Remi',
        bot: { ...settings, recall: { transcription: 'meeting_captions', languageCode, deleteMediaAfterImport: true } },
      }).recording_config.transcript.provider;
    expect(captions('auto')).toEqual({ meeting_captions: {} });
    expect(captions('de')).toEqual({ meeting_captions: { language_code: 'de' } });
  });
});

describe('event → status', () => {
  it('maps in-call events and ignores others', () => {
    expect(statusForEvent('bot.in_waiting_room')).toBe('waiting_room');
    expect(statusForEvent('bot.in_call_recording')).toBe('in_progress');
    expect(statusForEvent('bot.in_call_not_recording')).toBe('in_progress');
    expect(statusForEvent('bot.done')).toBeNull();
    expect(statusForEvent('bot.breakout_room_entered')).toBeNull();
  });

  it('only moves forward', () => {
    expect(statusesBefore('in_progress').sort()).toEqual(['joining', 'scheduled', 'waiting_room']);
    expect(statusesBefore('waiting_room').sort()).toEqual(['joining', 'scheduled']);
    expect(statusesBefore('completed')).toEqual([]);
  });
});

describe('analyseBot', () => {
  it('recorded call with a ready transcript', () => {
    const outcome = analyseBot(
      bot(
        [
          ['joining_call', null, '2026-11-04T10:00:00Z'],
          ['in_waiting_room', null, '2026-11-04T10:00:05Z'],
          ['in_call_recording', null, '2026-11-04T10:01:00Z'],
          ['call_ended', 'call_ended_by_host', '2026-11-04T10:31:00Z'],
          ['done', null, '2026-11-04T10:31:30Z'],
        ],
        transcriptRecording('done'),
      ),
    );
    expect(outcome).toEqual({
      finished: true,
      recorded: true,
      joinedAt: new Date('2026-11-04T10:01:00Z'),
      leftAt: new Date('2026-11-04T10:31:00Z'),
      failureReason: null,
      transcript: { state: 'done', downloadUrl: 'https://files.example/t.json' },
    });
  });

  it('transcript still processing / failed / missing', () => {
    const changes: [string, string | null, string][] = [
      ['in_call_recording', null, '2026-11-04T10:01:00Z'],
      ['done', null, '2026-11-04T10:31:30Z'],
    ];
    expect(analyseBot(bot(changes, transcriptRecording('processing'))).transcript).toEqual({ state: 'processing' });
    expect(analyseBot(bot(changes, transcriptRecording('failed'))).transcript).toEqual({ state: 'failed' });
    expect(analyseBot(bot(changes, transcriptRecording('done', null))).transcript).toEqual({ state: 'missing' });
    expect(analyseBot(bot(changes, [])).transcript).toEqual({ state: 'processing' });
    expect(
      analyseBot(bot(changes, [{ id: 'r', status: { code: 'done' }, media_shortcuts: { transcript: null } }]))
        .transcript,
    ).toEqual({ state: 'missing' });
  });

  it('never admitted: explains why', () => {
    const outcome = analyseBot(
      bot([
        ['joining_call', null, '2026-11-04T10:00:00Z'],
        ['in_waiting_room', null, '2026-11-04T10:00:05Z'],
        ['call_ended', 'timeout_exceeded_waiting_room', '2026-11-04T10:10:05Z'],
        ['done', null, '2026-11-04T10:10:10Z'],
      ]),
    );
    expect(outcome.finished).toBe(true);
    expect(outcome.recorded).toBe(false);
    expect(outcome.joinedAt).toBeNull();
    expect(outcome.failureReason).toBe('admission: Nobody admitted the bot from the waiting room in time');
  });

  it('fatal error wins over call_ended', () => {
    const outcome = analyseBot(
      bot([
        ['joining_call', null, '2026-11-04T10:00:00Z'],
        ['fatal', 'meeting_requires_sign_in', '2026-11-04T10:00:20Z'],
      ]),
    );
    expect(outcome.finished).toBe(true);
    expect(outcome.failureReason).toMatch(/^join: The meeting only admits signed-in accounts/);
  });

  it('a bot that is still running is not finished', () => {
    expect(analyseBot(bot([['in_call_recording', null, '2026-11-04T10:01:00Z']])).finished).toBe(false);
  });
});

describe('reasonForSubCode', () => {
  it('keeps unknown codes readable and sanitised', () => {
    expect(reasonForSubCode('some_new_code', false, true)).toBe('join: Recall.ai bot stopped (some_new_code)');
    expect(reasonForSubCode('<script>x', true, false)).toBe('capture: Recall.ai bot stopped (scriptx)');
    expect(reasonForSubCode(null, false, false)).toBe('admission: Not admitted to the meeting');
  });
});

describe('transcriptToSegments', () => {
  const w = (text: string, start: number | null, end: number | null = start) => ({
    text,
    start_timestamp: { relative: start, absolute: null },
    end_timestamp: { relative: end, absolute: null },
  });

  it('turns speaker blocks into ordered segments', () => {
    const segments = transcriptToSegments([
      { participant: { id: 1, name: ' Asha  Rao ' }, words: [w('Hello', 1.2, 1.5), w('team.', 1.6, 2.04)] },
      { participant: { id: 2, name: null }, words: [w('Hi!', 3, 3.4)] },
      { participant: null, words: [w('   ', 4)] },
    ]);
    expect(segments).toEqual([
      { seq: 0, speaker: 'Asha Rao', text: 'Hello team.', startMs: 1200, endMs: 2040 },
      { seq: 1, speaker: 'Speaker 2', text: 'Hi!', startMs: 3000, endMs: 3400 },
    ]);
  });

  it('splits long monologues and keeps time moving forward without word timestamps', () => {
    const words = Array.from({ length: 400 }, (_, i) => w(`word${i}`, null));
    const segments = transcriptToSegments([
      { participant: { id: 1, name: 'A' }, words: [w('start', 10, 11)] },
      { participant: { id: 2, name: 'B' }, words },
    ]);
    expect(segments.length).toBeGreaterThan(2);
    expect(segments.every((s) => s.text.length <= 1500)).toBe(true);
    expect(segments.map((s) => s.seq)).toEqual(segments.map((_, i) => i));
    expect(segments.slice(1).every((s) => s.startMs === 10_000 && s.speaker === 'B')).toBe(true);
    expect(
      segments
        .slice(1)
        .map((s) => s.text)
        .join(' '),
    ).toBe(words.map((x) => x.text).join(' '));
  });
});
