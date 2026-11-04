import { Injectable, Logger } from '@nestjs/common';
import { RecallClient, recallHttpError } from '../../../infra/recall/recall.client';
import type { BotSettings } from '../../content/settings.schemas';
import { BotStepError } from '../runner/bot-step-error';
import { buildCreateBotRequest } from './recall-mapping';

/** How long to keep asking while Recall.ai's ad-hoc bot pool is empty (507) or rate-limited (429). */
const POOL_WAIT_MS = 5 * 60_000;
const POOL_RETRY_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** User-safe reason for a failed create-bot call (provider detail only for request errors). */
export function dispatchFailureMessage(status: number | undefined, detail: string | null): string {
  if (status === 401 || status === 403)
    return 'Recall.ai rejected the API key (check RECALL_API_KEY and RECALL_REGION)';
  if (status === 402) return 'The Recall.ai account has no credit left';
  if (status === 507) return 'Recall.ai had no bot available; try again in a few minutes';
  if (status === 429) return 'Recall.ai is rate limiting requests; try again in a minute';
  if (status && status >= 400 && status < 500) {
    return detail ? `Recall.ai refused the bot: ${detail}` : `Recall.ai refused the bot (HTTP ${status})`;
  }
  return 'Recall.ai is unavailable right now';
}

/**
 * Sends a Recall.ai bot into a meeting (provider `recall`). Runs in the bot process at join time, like the
 * self-hosted runner; status updates then arrive as signed webhooks (see RecallWebhookController).
 */
@Injectable()
export class RecallDispatcher {
  private readonly logger = new Logger(RecallDispatcher.name);

  constructor(private readonly client: RecallClient) {}

  /** Returns the Recall.ai bot id. Throws BotStepError('join', <user-safe reason>) on failure. */
  async dispatch(input: { meetingId: string; meetingUrl: string; botName: string; bot: BotSettings }): Promise<string> {
    if (!this.client.configured) {
      throw new BotStepError('join', 'Recall.ai is not configured: set RECALL_API_KEY on the server');
    }
    const body = buildCreateBotRequest(input);
    const deadline = Date.now() + POOL_WAIT_MS;
    for (let attempt = 1; ; attempt++) {
      try {
        const created = await this.client.createBot(body);
        this.logger.log({ meetingId: input.meetingId, recallBotId: created.id, attempt }, 'recall bot created');
        return created.id;
      } catch (err) {
        const http = recallHttpError(err);
        // 507/429 mean the request was not processed, so retrying cannot create a second bot.
        const waitable = http?.status === 507 || http?.status === 429;
        if (waitable && Date.now() + POOL_RETRY_MS < deadline) {
          this.logger.warn({ meetingId: input.meetingId, status: http?.status, attempt }, 'recall busy; retrying');
          await sleep(POOL_RETRY_MS);
          continue;
        }
        throw new BotStepError('join', dispatchFailureMessage(http?.status, http?.detail ?? null), { cause: err });
      }
    }
  }
}
