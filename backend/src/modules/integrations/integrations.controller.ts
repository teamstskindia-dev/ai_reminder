import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import { AppException } from '../../common/errors/app.exception';
import { ApiDataResponse, ApiErrors } from '../../common/swagger/api-docs.decorators';
import { QueuedResult } from '../../common/swagger/common-results.dto';
import { QUEUE } from '../../infra/queue/queue.constants';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { CalendarConnectionService } from '../calendar/calendar-connection.service';
import { enqueueUserSync } from '../calendar/sync-producer';
import { SettingsService } from '../content/settings.service';
import { Integration } from '../users/dto/users.responses.dto';
import { toIntegration } from '../users/users.mapper';
import { GoogleAccountsRepository } from '../users/users.repository';

@ApiTags('integrations')
@UserAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly accounts: GoogleAccountsRepository,
    private readonly connection: CalendarConnectionService,
    private readonly settings: SettingsService,
    @InjectQueue(QUEUE.CALENDAR_SYNC) private readonly syncQueue: Queue,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List integrations and their connection status' })
  @ApiDataResponse(Integration, { isArray: true })
  async list(@CurrentUserId() userId: string) {
    return [toIntegration(await this.accounts.find(userId))];
  }

  @Post('google-calendar/sync')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sync Google Calendar now',
    description:
      'Queues a sync. Fails with `FORBIDDEN` when calendar sync is disabled and `CONFLICT` when not connected.',
  })
  @ApiDataResponse(QueuedResult)
  @ApiErrors('FORBIDDEN', 'CONFLICT')
  async sync(@CurrentUserId() userId: string): Promise<{ queued: true }> {
    const features = await this.settings.get('features');
    if (!features.calendarSync) throw AppException.forbidden('Calendar sync is disabled');
    const account = await this.accounts.find(userId);
    if (!account?.calendarConnected) {
      throw AppException.conflict('Google Calendar is not connected. Sign in with Google again to connect it.');
    }
    await enqueueUserSync(this.syncQueue, userId, 'manual');
    return { queued: true };
  }

  @Delete('google-calendar')
  @HttpCode(204)
  @ApiOperation({ summary: 'Disconnect Google Calendar (revokes the Google grant)' })
  @ApiNoContentResponse({ description: 'Disconnected.' })
  async disconnect(@CurrentUserId() userId: string): Promise<void> {
    await this.connection.disconnect(userId, { revokeAtGoogle: true, syncError: null });
  }
}
