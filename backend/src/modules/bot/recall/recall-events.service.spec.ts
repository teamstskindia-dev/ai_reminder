import type { Queue } from 'bullmq';
import type { MeetingRow } from '../../../infra/prisma/models';
import type { RecallClient } from '../../../infra/recall/recall.client';
import type { RecallBot } from '../../../infra/recall/recall.types';
import type { RecallEventJob } from '../../../infra/queue/queue.constants';
import { SETTINGS_DEFAULTS } from '../../content/settings.defaults';
import type { SettingsService } from '../../content/settings.service';
import type { MeetingEventsService } from '../../meetings/meeting-events.service';
import type { MeetingsRepository, TranscriptRepository } from '../../meetings/meetings.repository';
import type { NotificationProducer } from '../../notifications/notification-producer.service';
import { RecallEventsService, TranscriptNotReadyError } from './recall-events.service';

const BOT_ID = '6b2f3c1e-9a41-4f5e-8d2c-1a2b3c4d5e6f';

function meetingRow(overrides: Partial<MeetingRow> = {}): MeetingRow {
  return {
    id: 'meeting-1',
    userId: 'user-1',
    title: 'Weekly sync',
    status: 'joining',
    botProvider: 'recall',
    externalBotId: BOT_ID,
    botJoinedAt: null,
    botLeftAt: null,
    failureReason: null,
    ...overrides,
  } as MeetingRow;
}

const finishedBot = (transcriptCode: string | null, recorded = true): RecallBot => ({
  id: BOT_ID,
  status_changes: [
    { code: 'joining_call', sub_code: null, created_at: '2026-11-04T10:00:00Z' },
    ...(recorded
      ? [{ code: 'in_call_recording', sub_code: null, created_at: '2026-11-04T10:01:00Z' }]
      : [{ code: 'in_waiting_room', sub_code: null, created_at: '2026-11-04T10:00:10Z' }]),
    {
      code: 'call_ended',
      sub_code: recorded ? 'call_ended_by_host' : 'bot_kicked_from_waiting_room',
      created_at: '2026-11-04T10:31:00Z',
    },
    { code: 'done', sub_code: null, created_at: '2026-11-04T10:31:20Z' },
  ],
  recordings: transcriptCode
    ? [
        {
          id: 'rec-1',
          status: { code: 'done' },
          media_shortcuts: {
            transcript: { id: 't-1', status: { code: transcriptCode }, data: { download_url: 'https://dl.example/t' } },
          },
        },
      ]
    : [],
});

function setup(meeting: MeetingRow | null, bot?: RecallBot, segmentCount = 0) {
  let current = meeting;
  const meetings = {
    findByExternalBotId: jest.fn(() => Promise.resolve(current)),
    updateIfStatus: jest.fn((_id: string, from: string[], data: Partial<MeetingRow>) => {
      if (!current || !from.includes(current.status)) return Promise.resolve(null);
      current = { ...current, ...data };
      return Promise.resolve(current);
    }),
    update: jest.fn((_id: string, data: Partial<MeetingRow>) => {
      current = { ...current, ...data } as MeetingRow;
      return Promise.resolve(current);
    }),
  };
  const transcripts = {
    count: jest.fn(() => Promise.resolve(segmentCount)),
    replaceAll: jest.fn(() => Promise.resolve()),
  };
  const events = {
    emit: jest.fn(),
    setStatus: jest.fn((_id: string, status: string, extra: object) => {
      current = { ...current, ...extra, status } as MeetingRow;
      return Promise.resolve(current);
    }),
  };
  const client = {
    getBot: jest.fn(() => Promise.resolve(bot)),
    downloadTranscript: jest.fn(() =>
      Promise.resolve([
        {
          participant: { id: 1, name: 'Asha' },
          words: [{ text: 'Ship it Friday.', start_timestamp: { relative: 3 }, end_timestamp: { relative: 4.5 } }],
        },
      ]),
    ),
    deleteMedia: jest.fn(() => Promise.resolve()),
  };
  const settings = { get: jest.fn(() => Promise.resolve(SETTINGS_DEFAULTS.bot)) };
  const notifications = { notify: jest.fn(() => Promise.resolve()) };
  const aiQueue = { getJob: jest.fn(() => Promise.resolve(undefined)), add: jest.fn(() => Promise.resolve({})) };
  const service = new RecallEventsService(
    client as unknown as RecallClient,
    meetings as unknown as MeetingsRepository,
    transcripts as unknown as TranscriptRepository,
    events as unknown as MeetingEventsService,
    settings as unknown as SettingsService,
    notifications as unknown as NotificationProducer,
    aiQueue as unknown as Queue,
  );
  return { service, meetings, transcripts, events, client, notifications, aiQueue, current: () => current };
}

const job = (event: string, extra: Partial<RecallEventJob> = {}): RecallEventJob => ({
  botId: BOT_ID,
  event,
  subCode: null,
  updatedAt: '2026-11-04T10:01:00Z',
  ...extra,
});

describe('RecallEventsService', () => {
  it('ignores bots it does not know and finished meetings', async () => {
    expect(await setup(null).service.handle(job('bot.done'))).toBe('ignored: unknown bot');
    expect(await setup(meetingRow({ status: 'completed' })).service.handle(job('bot.done'))).toBe(
      'ignored: meeting is completed',
    );
  });

  it('moves a meeting forward on in-call events, never backwards', async () => {
    const ctx = setup(meetingRow({ status: 'joining' }));
    expect(await ctx.service.handle(job('bot.in_waiting_room'))).toBe('status: waiting_room');
    expect(await ctx.service.handle(job('bot.in_call_recording'))).toBe('status: in_progress');
    expect(ctx.current()?.botJoinedAt).toEqual(new Date('2026-11-04T10:01:00Z'));
    // A late, out-of-order waiting-room event does not undo in_progress.
    expect(await ctx.service.handle(job('bot.in_waiting_room'))).toBe('unchanged: in_progress');
    expect(ctx.current()?.status).toBe('in_progress');
    expect(ctx.events.emit).toHaveBeenCalledTimes(2);
  });

  it('imports the transcript on bot.done and queues AI processing', async () => {
    const ctx = setup(
      meetingRow({ status: 'in_progress', botJoinedAt: new Date('2026-11-04T10:01:00Z') }),
      finishedBot('done'),
    );
    expect(await ctx.service.handle(job('bot.done'))).toBe('imported: 1 segments');
    expect(ctx.current()?.status).toBe('processing');
    expect(ctx.current()?.durationSeconds).toBe(1800);
    expect(ctx.transcripts.replaceAll).toHaveBeenCalledWith('meeting-1', [
      { seq: 0, speaker: 'Asha', text: 'Ship it Friday.', startMs: 3000, endMs: 4500 },
    ]);
    expect(ctx.aiQueue.add).toHaveBeenCalledWith('process', expect.objectContaining({ meetingId: 'meeting-1' }), {
      jobId: 'ai-meeting-1',
    });
    expect(ctx.client.deleteMedia).toHaveBeenCalledWith(BOT_ID);
    expect(ctx.notifications.notify).not.toHaveBeenCalled();
  });

  it('retries while the transcript is still processing', async () => {
    const ctx = setup(meetingRow({ status: 'in_progress' }), finishedBot('processing'));
    await expect(ctx.service.handle(job('bot.done'))).rejects.toBeInstanceOf(TranscriptNotReadyError);
    expect(ctx.current()?.status).toBe('processing');
    expect(ctx.transcripts.replaceAll).not.toHaveBeenCalled();
  });

  it('does not import twice', async () => {
    const ctx = setup(meetingRow({ status: 'processing' }), finishedBot('done'), 12);
    expect(await ctx.service.handle(job('bot.done'))).toBe('skipped: transcript already imported');
    expect(ctx.client.getBot).not.toHaveBeenCalled();
  });

  it('fails with a readable reason (and notifies once) when the bot was never admitted', async () => {
    const ctx = setup(meetingRow({ status: 'waiting_room' }), finishedBot(null, false));
    expect(await ctx.service.handle(job('bot.done'))).toBe('failed: admission: Host denied the request to join');
    expect(ctx.current()?.status).toBe('failed');
    expect(ctx.notifications.notify).toHaveBeenCalledTimes(1);
    // A second final event (e.g. bot.fatal) finds the meeting already failed.
    expect(await ctx.service.handle(job('bot.fatal'))).toBe('ignored: meeting is failed');
    expect(ctx.notifications.notify).toHaveBeenCalledTimes(1);
  });

  it('final failure after waiting for the transcript marks the meeting failed', async () => {
    const ctx = setup(meetingRow({ status: 'processing' }));
    await ctx.service.onFinalFailure(job('bot.done'), new TranscriptNotReadyError());
    expect(ctx.current()?.status).toBe('failed');
    expect(ctx.current()?.failureReason).toBe('capture: Recall.ai did not deliver the transcript in time');
    expect(ctx.notifications.notify).toHaveBeenCalledTimes(1);
  });

  it('waits when the bot is not finished yet', async () => {
    const running: RecallBot = {
      id: BOT_ID,
      status_changes: [{ code: 'in_call_recording', sub_code: null, created_at: '2026-11-04T10:01:00Z' }],
      recordings: [],
    };
    const ctx = setup(meetingRow({ status: 'in_progress' }), running);
    expect(await ctx.service.handle(job('transcript.done'))).toBe('waiting: bot is still in the call');
    expect(ctx.current()?.status).toBe('in_progress');
  });
});
