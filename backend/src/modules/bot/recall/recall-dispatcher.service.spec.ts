import { UpstreamError } from '../../../common/errors/app.exception';
import { RecallHttpError, type RecallClient } from '../../../infra/recall/recall.client';
import { SETTINGS_DEFAULTS } from '../../content/settings.defaults';
import { BotStepError } from '../runner/bot-step-error';
import { dispatchFailureMessage, RecallDispatcher } from './recall-dispatcher.service';

const BOT_ID = '6b2f3c1e-9a41-4f5e-8d2c-1a2b3c4d5e6f';
const input = {
  meetingId: 'm-1',
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
  botName: 'Remi',
  bot: { ...SETTINGS_DEFAULTS.bot, provider: 'recall' as const },
};
const httpError = (status: number, detail: string | null = null) =>
  new UpstreamError('recall', undefined, new RecallHttpError(status, detail), status >= 500);

describe('RecallDispatcher', () => {
  afterEach(() => jest.useRealTimers());

  it('refuses to dispatch without an API key', async () => {
    const client = { configured: false, createBot: jest.fn() };
    const dispatcher = new RecallDispatcher(client as unknown as RecallClient);
    await expect(dispatcher.dispatch(input)).rejects.toThrow(/RECALL_API_KEY/);
    expect(client.createBot).not.toHaveBeenCalled();
  });

  it('returns the new bot id', async () => {
    const client = { configured: true, createBot: jest.fn(() => Promise.resolve({ id: BOT_ID })) };
    const dispatcher = new RecallDispatcher(client as unknown as RecallClient);
    await expect(dispatcher.dispatch(input)).resolves.toBe(BOT_ID);
    expect(client.createBot).toHaveBeenCalledWith(expect.objectContaining({ metadata: { remi_meeting_id: 'm-1' } }));
  });

  it('waits and retries while no bot is available (507)', async () => {
    jest.useFakeTimers();
    const client = {
      configured: true,
      createBot: jest.fn().mockRejectedValueOnce(httpError(507)).mockResolvedValueOnce({ id: BOT_ID }),
    };
    const dispatcher = new RecallDispatcher(client as unknown as RecallClient);
    const result = dispatcher.dispatch(input);
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(result).resolves.toBe(BOT_ID);
    expect(client.createBot).toHaveBeenCalledTimes(2);
  });

  it('never retries other failures (a timed-out create may already have created a bot)', async () => {
    const client = { configured: true, createBot: jest.fn().mockRejectedValue(httpError(400, 'meeting_url: Invalid')) };
    const dispatcher = new RecallDispatcher(client as unknown as RecallClient);
    const err = await dispatcher.dispatch(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BotStepError);
    expect((err as BotStepError).failureReason).toBe('join: Recall.ai refused the bot: meeting_url: Invalid');
    expect(client.createBot).toHaveBeenCalledTimes(1);
  });
});

describe('dispatchFailureMessage', () => {
  it.each([
    [401, 'Recall.ai rejected the API key (check RECALL_API_KEY and RECALL_REGION)'],
    [402, 'The Recall.ai account has no credit left'],
    [404, 'Recall.ai refused the bot (HTTP 404)'],
    [500, 'Recall.ai is unavailable right now'],
    [undefined, 'Recall.ai is unavailable right now'],
  ])('%s', (status, message) => {
    expect(dispatchFailureMessage(status, null)).toBe(message);
  });
});
