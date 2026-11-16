import { InjectQueue } from '@nestjs/bullmq';
import { Body, Controller, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { ApiBody, ApiExtension, ApiHeader, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Queue } from 'bullmq';
import { MaintenanceExempt, SkipEnvelope } from '../../../common/decorators/metadata.decorators';
import { AppException } from '../../../common/errors/app.exception';
import type { AppRequest } from '../../../common/http/request.types';
import { ApiErrors, OPENAPI_EXT } from '../../../common/swagger/api-docs.decorators';
import { AppConfig } from '../../../config/app-config';
import { verifyRecallWebhook } from '../../../infra/recall/recall-webhook';
import { recallWebhookSchema } from '../../../infra/recall/recall.types';
import { addJob } from '../../../infra/queue/job-utils';
import { JOB, JobId, QUEUE, RecallEventJob } from '../../../infra/queue/queue.constants';

/** Request with the exact body bytes (kept by the JSON parser for /webhooks/* only, see main.ts). */
export type RawBodyRequest = AppRequest & { rawBody?: Buffer };

class WebhookAck {
  @ApiProperty({ example: true }) received!: true;
}

/**
 * Recall.ai → Remi status webhooks. Only verified deliveries are accepted; each one becomes a `bot-events`
 * job keyed by its delivery id (Recall.ai retries reuse it, so duplicates collapse) and the worker applies it.
 * Answering fast keeps Recall.ai's 15 s delivery timeout far away.
 */
@ApiTags('webhooks')
@MaintenanceExempt()
@SkipEnvelope()
@Throttle({ default: { limit: 600, ttl: 60_000 } })
@Controller('webhooks')
export class RecallWebhookController {
  private readonly logger = new Logger(RecallWebhookController.name);

  constructor(
    private readonly config: AppConfig,
    @InjectQueue(QUEUE.BOT_EVENTS) private readonly botEvents: Queue,
  ) {}

  @Post('recall')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Recall.ai bot status webhook',
    description:
      'Called by Recall.ai, not by clients. Signed with the workspace verification secret ' +
      '(`webhook-id`, `webhook-timestamp`, `webhook-signature`; HMAC-SHA256). Not wrapped in the envelope.',
  })
  @ApiExtension(OPENAPI_EXT.maintenanceExempt, true)
  @ApiHeader({ name: 'webhook-id', required: true })
  @ApiHeader({ name: 'webhook-timestamp', required: true })
  @ApiHeader({ name: 'webhook-signature', required: true })
  @ApiBody({ schema: { type: 'object', additionalProperties: true } })
  @ApiOkResponse({ type: WebhookAck, description: 'Accepted (or ignored: not about a bot).' })
  @ApiErrors('UNAUTHORIZED', 'BAD_REQUEST')
  async recall(@Req() req: RawBodyRequest, @Body() body: unknown): Promise<WebhookAck> {
    const secret = this.config.recall.webhookSecret;
    if (!secret) {
      this.logger.warn('recall webhook refused: RECALL_WEBHOOK_SECRET is not set');
      throw AppException.unauthorized('Webhook signing secret is not configured');
    }
    if (!req.rawBody?.length) throw AppException.badRequest('Missing webhook body');

    const verified = verifyRecallWebhook(req.headers, req.rawBody, secret);
    if (!verified.ok) {
      this.logger.warn({ reason: verified.reason }, 'recall webhook refused');
      throw AppException.unauthorized('Invalid webhook signature');
    }

    const parsed = recallWebhookSchema.safeParse(body);
    const botId = parsed.success ? parsed.data.data.bot?.id : undefined;
    if (!parsed.success || !botId) {
      // Signed but not a bot event Remi understands: acknowledge so Recall.ai does not retry it for 24 h.
      this.logger.warn({ webhookId: verified.webhookId, parsed: parsed.success }, 'recall webhook ignored');
      return { received: true };
    }

    const { event, data } = parsed.data;
    await addJob<RecallEventJob>(
      this.botEvents,
      JOB.RECALL_EVENT,
      { botId, event, subCode: data.data?.sub_code ?? null, updatedAt: data.data?.updated_at ?? null },
      { jobId: JobId.recallEvent(verified.webhookId) },
    );
    this.logger.log({ webhookId: verified.webhookId, event, recallBotId: botId }, 'recall webhook queued');
    return { received: true };
  }
}
