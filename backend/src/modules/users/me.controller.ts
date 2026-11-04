import { Body, Controller, Delete, Get, HttpCode, Patch, Res } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiDataResponse } from '../../common/swagger/api-docs.decorators';
import { AuthCookiesService } from '../auth/auth-cookies.service';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { MeetingSchedulerService } from '../bot/meeting-scheduler.service';
import { AccountDeletionService } from './account-deletion.service';
import { UpdateMeDto, UpdateUserSettingsDto } from './dto/users.dto';
import { User, UserSettings } from './dto/users.responses.dto';
import { UsersService } from './users.service';

@ApiTags('me')
@UserAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly deletion: AccountDeletionService,
    private readonly scheduler: MeetingSchedulerService,
    private readonly cookies: AuthCookiesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the signed-in user' })
  @ApiDataResponse(User)
  me(@CurrentUserId() userId: string) {
    return this.users.getUser(userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update profile fields (name, time zone, locale) or mark onboarding done' })
  @ApiDataResponse(User)
  update(@CurrentUserId() userId: string, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(userId, dto);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete the account',
    description: 'Permanently deletes the user, their meetings, recordings and tokens, and clears the auth cookies.',
  })
  @ApiNoContentResponse({ description: 'Account deleted.' })
  async remove(@CurrentUserId() userId: string, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.deletion.deleteUser(userId);
    this.cookies.clear(res, 'user');
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get notification and meeting-bot settings' })
  @ApiDataResponse(UserSettings)
  settings(@CurrentUserId() userId: string) {
    return this.users.getSettings(userId);
  }

  @Patch('settings')
  @ApiOperation({
    summary: 'Update notification and meeting-bot settings',
    description:
      'Changing `autoJoin` or `meetingReminderMinutes` reschedules the bot and reminders for upcoming meetings.',
  })
  @ApiDataResponse(UserSettings)
  async updateSettings(@CurrentUserId() userId: string, @Body() dto: UpdateUserSettingsDto) {
    const { settings, reschedule } = await this.users.updateSettings(userId, dto);
    if (reschedule) await this.scheduler.rescheduleUser(userId);
    return settings;
  }
}
