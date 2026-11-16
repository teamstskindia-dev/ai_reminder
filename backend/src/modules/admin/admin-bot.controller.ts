import { Controller, Get, HttpCode, Post, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiDataResponse, ApiErrors } from '../../common/swagger/api-docs.decorators';
import { AppConfig } from '../../config/app-config';
import { RecallClient, recallHttpError } from '../../infra/recall/recall.client';
import { AdminAuth } from '../auth/auth.decorators';
import { API_PREFIX } from '../../openapi';
import { Audited, AuditInterceptor } from './audit';
import { BotProviderStatus, RecallConnectionTest } from './dto/admin.responses.dto';

/** Admin → Meeting bot: which providers are usable on this server (secrets are reported as set/unset only). */
@ApiTags('admin: system')
@AdminAuth('viewer')
@UseInterceptors(AuditInterceptor)
@Controller('admin/bot')
export class AdminBotController {
  constructor(
    private readonly config: AppConfig,
    private readonly recall: RecallClient,
  ) {}

  @Get('providers')
  @ApiOperation({ summary: 'Get the configuration status of the meeting bot providers' })
  @ApiDataResponse(BotProviderStatus)
  providers(): BotProviderStatus {
    const recall = this.config.recall;
    const bot = this.config.bot;
    return {
      recall: {
        apiKeyConfigured: recall.configured,
        webhookSecretConfigured: recall.webhookConfigured,
        region: recall.region,
        webhookUrl: `${this.config.urls.api}/${API_PREFIX}/webhooks/recall`,
        dashboardUrl: `${recall.baseUrl}/dashboard`,
      },
      selfHosted: { mode: bot.mode, persistentProfile: !!bot.profileDir },
    };
  }

  @Post('recall/test')
  @HttpCode(200)
  @AdminAuth('admin')
  @Audited('bot.recall_test', 'app_settings')
  @ApiOperation({ summary: 'Check that Recall.ai accepts the configured API key' })
  @ApiDataResponse(RecallConnectionTest)
  @ApiErrors('UPSTREAM_ERROR')
  async testRecall(): Promise<RecallConnectionTest> {
    const { region } = this.config.recall;
    if (!this.recall.configured) return { ok: false, message: 'RECALL_API_KEY is not set on the server.' };
    try {
      const ok = await this.recall.verifyKey();
      return ok
        ? { ok: true, message: `Recall.ai accepted the API key (${region}).` }
        : { ok: false, message: `Recall.ai rejected the API key. Check that it was created in ${region}.` };
    } catch (err) {
      const status = recallHttpError(err)?.status;
      return { ok: false, message: `Recall.ai could not be reached${status ? ` (HTTP ${status})` : ''}.` };
    }
  }
}
