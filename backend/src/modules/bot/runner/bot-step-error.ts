/** Phases of a bot session; failure reasons are prefixed with the step that failed. */
export type BotStep = 'navigate' | 'prejoin' | 'join' | 'admission' | 'captions' | 'capture' | 'leave';

export const BOT_STEPS: readonly BotStep[] = [
  'navigate',
  'prejoin',
  'join',
  'admission',
  'captions',
  'capture',
  'leave',
];

/** Maximum length of `meetings.failure_reason` written by the bot. */
export const MAX_FAILURE_REASON = 300;

/**
 * A failure in a named bot step. `message` is short and user-safe (it ends up in
 * `failure_reason`); provider/browser details stay in `cause` and only reach the logs.
 */
export class BotStepError extends Error {
  constructor(
    readonly step: BotStep,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'BotStepError';
  }

  /** e.g. "admission: Not admitted to the meeting" (sanitised, ≤ 300 chars). */
  get failureReason(): string {
    return formatFailureReason(this.step, this.message);
  }
}

/** First line of a message without stack frames, file paths or long URLs; whitespace collapsed. */
export function sanitizeMessage(message: string): string {
  const firstLine = message.split(/\r?\n/)[0] ?? '';
  return firstLine
    .replace(/\s+at\s+\S+\s*\(.*$/, '') // "at fn (file:line)" stack frame fragments
    .replace(/(?:file:\/\/|\/)[\w./-]+\.(?:js|ts|mjs|cjs)(?::\d+)*/g, '') // file paths
    .replace(/https?:\/\/\S{60,}/g, (url) => `${url.slice(0, 40)}…`)
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** "step: message", sanitised and truncated to MAX_FAILURE_REASON characters. */
export function formatFailureReason(step: BotStep | null, message: string): string {
  const clean = sanitizeMessage(message) || 'unknown error';
  const alreadyPrefixed = BOT_STEPS.some((s) => clean.startsWith(`${s}: `));
  const reason = step && !alreadyPrefixed ? `${step}: ${clean}` : clean;
  return truncate(reason, MAX_FAILURE_REASON);
}

/** failure_reason for any error: BotStepError keeps its step; other errors get `fallbackStep`. */
export function failureReasonFrom(err: unknown, fallbackStep: BotStep): string {
  if (err instanceof BotStepError) return err.failureReason;
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'unexpected error';
  return formatFailureReason(fallbackStep, message);
}

/**
 * Runs one bot step. Errors that are not already BotStepErrors are wrapped with the step and a
 * safe `message` (the original error is kept as `cause` for logs).
 */
export async function runStep<T>(step: BotStep, safeMessage: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof BotStepError) throw err;
    throw new BotStepError(step, safeMessage, { cause: err });
  }
}
