import {
  BotStepError,
  failureReasonFrom,
  formatFailureReason,
  MAX_FAILURE_REASON,
  runStep,
  sanitizeMessage,
} from './bot-step-error';

describe('BotStepError / failure reasons', () => {
  it('prefixes the step', () => {
    expect(new BotStepError('admission', 'Not admitted to the meeting').failureReason).toBe(
      'admission: Not admitted to the meeting',
    );
    expect(formatFailureReason('navigate', 'page failed to load')).toBe('navigate: page failed to load');
  });

  it('does not double-prefix (same or another step)', () => {
    expect(formatFailureReason('navigate', 'navigate: invalid Google Meet URL')).toBe(
      'navigate: invalid Google Meet URL',
    );
    expect(failureReasonFrom(new Error('navigate: invalid Google Meet URL'), 'join')).toBe(
      'navigate: invalid Google Meet URL',
    );
    expect(formatFailureReason(null, 'Not admitted')).toBe('Not admitted');
  });

  it('truncates to the maximum length', () => {
    const reason = formatFailureReason('capture', 'x'.repeat(1000));
    expect(reason.length).toBeLessThanOrEqual(MAX_FAILURE_REASON);
    expect(reason.endsWith('…')).toBe(true);
  });

  it('strips stack traces, file paths and extra lines', () => {
    const raw =
      'TimeoutError: Navigation timeout of 60000 ms exceeded\n    at LifecycleWatcher (/app/node_modules/puppeteer-core/lib/x.js:12:3)';
    expect(sanitizeMessage(raw)).toBe('TimeoutError: Navigation timeout of 60000 ms exceeded');
    expect(sanitizeMessage('failed at /app/dist/modules/bot/runner/meet-runner.js:120:5 badly')).toBe(
      'failed at badly',
    );
  });

  it('shortens very long URLs', () => {
    const msg = sanitizeMessage(`net::ERR_ABORTED at https://meet.google.com/${'a'.repeat(100)}`);
    expect(msg.length).toBeLessThan(100);
    expect(msg).toContain('…');
  });

  it('uses a fallback step for foreign errors and keeps BotStepError steps', () => {
    expect(failureReasonFrom(new Error('boom'), 'join')).toBe('join: boom');
    expect(failureReasonFrom('plain', 'leave')).toBe('leave: plain');
    expect(failureReasonFrom(new BotStepError('captions', 'could not enable captions'), 'join')).toBe(
      'captions: could not enable captions',
    );
    expect(failureReasonFrom(undefined, 'capture')).toBe('capture: unexpected error');
  });

  it('falls back to "unknown error" for empty messages', () => {
    expect(formatFailureReason('join', '   ')).toBe('join: unknown error');
  });
});

describe('runStep', () => {
  it('returns the result on success', async () => {
    await expect(runStep('navigate', 'page failed to load', () => Promise.resolve(42))).resolves.toBe(42);
  });

  it('wraps foreign errors with the step and a safe message, keeping the cause', async () => {
    const cause = new Error('net::ERR_NAME_NOT_RESOLVED');
    const err = await runStep('navigate', 'page failed to load', () => Promise.reject(cause)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BotStepError);
    expect((err as BotStepError).failureReason).toBe('navigate: page failed to load');
    expect((err as BotStepError).cause).toBe(cause);
  });

  it('passes BotStepErrors through unchanged', async () => {
    const inner = new BotStepError('admission', 'Host denied the request to join');
    await expect(runStep('join', 'join failed', () => Promise.reject(inner))).rejects.toBe(inner);
  });
});
