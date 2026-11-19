import { InjectQueue } from '@nestjs/bullmq';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiFoundResponse, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import { AppException } from '../../common/errors/app.exception';
import { ApiDataResponse, ApiErrors } from '../../common/swagger/api-docs.decorators';
import { QueuedResult } from '../../common/swagger/common-results.dto';
import { QUEUE } from '../../infra/queue/queue.constants';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { CalendarConnectionService } from '../calendar/calendar-connection.service';
import { enqueueUserSync } from '../calendar/sync-producer';
import { ConnectQueryDto, UpdateIntegrationDto } from '../connections/connections.dto';
import { ConnectionsService } from '../connections/connections.service';
import { SettingsService } from '../content/settings.service';
import { ConnectUrl, Integration } from '../users/dto/users.responses.dto';
import { GoogleAccountsRepository } from '../users/users.repository';

@ApiTags('integrations')
@UserAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly accounts: GoogleAccountsRepository,
    private readonly connection: CalendarConnectionService,
    private readonly connections: ConnectionsService,
    private readonly settings: SettingsService,
    @InjectQueue(QUEUE.CALENDAR_SYNC) private readonly syncQueue: Queue,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List connected apps and their status',
    description:
      'Google Calendar, Gmail, Outlook, Notion, Jira, Linear and Todoist. `available: false` means the server has ' +
      'no OAuth client for it yet; `status: needs_reconnect` means access expired or was revoked.',
  })
  @ApiDataResponse(Integration, { isArray: true })
  list(@CurrentUserId() userId: string) {
    return this.connections.list(userId);
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

  @Get(':provider/connect')
  @ApiOperation({
    summary: 'Start connecting an app',
    description:
      'Returns the consent URL for gmail, outlook, notion, jira, linear or todoist. Open it in an auth session; ' +
      'after consent the API redirects to `redirectUri` with `?provider=…&status=connected` or `&error=` ' +
      '(`access_denied`, `connect_failed`). `redirectUri` must be in the mobile redirect allowlist.',
  })
  @ApiDataResponse(ConnectUrl)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  connect(@CurrentUserId() userId: string, @Param('provider') provider: string, @Query() q: ConnectQueryDto) {
    return this.connections.connectUrl(userId, provider, q.redirectUri, q.mode ?? 'send');
  }

  @Patch(':provider')
  @ApiOperation({
    summary: 'Change a connected tool’s defaults',
    description: 'Default project / database / team for new tasks and whether tasks are created without asking.',
  })
  @ApiDataResponse(Integration)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  update(@CurrentUserId() userId: string, @Param('provider') provider: string, @Body() dto: UpdateIntegrationDto) {
    return this.connections.updateSettings(userId, provider, dto);
  }

  @Delete(':provider')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Disconnect an app',
    description: 'Revokes access where the provider allows it. Emails read from it are deleted; tasks stay as to-dos.',
  })
  @ApiNoContentResponse({ description: 'Disconnected.' })
  @ApiErrors('NOT_FOUND')
  async remove(@CurrentUserId() userId: string, @Param('provider') provider: string): Promise<void> {
    await this.connections.disconnect(userId, provider);
  }
}

/** Public: the providers redirect the browser here after consent. */
@ApiTags('integrations')
@Controller('integrations/oauth')
export class IntegrationsCallbackController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get('callback')
  @ApiOperation({
    summary: 'OAuth callback for connected apps',
    description:
      'Called by Gmail, Outlook, Notion, Jira, Linear or Todoist with `code` and `state`. Always redirects to the ' +
      'app (or website) that started the connection, with `?provider=…&status=connected` or `&error=`.',
  })
  @ApiFoundResponse({ description: 'Redirect back to the app.' })
  async callback(@Query() query: Record<string, string | undefined>, @Res() res: Response): Promise<void> {
    res.redirect(302, await this.connections.handleCallback(query));
  }
}
