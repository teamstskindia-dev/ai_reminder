import { Body, Controller, Delete, Get, HttpCode, Patch, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthCookiesService } from '../auth/auth-cookies.service';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { MeetingSchedulerService } from '../bot/meeting-scheduler.service';
import { AccountDeletionService } from './account-deletion.service';
import { UpdateMeDto, UpdateUserSettingsDto } from './dto/users.dto';
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
  me(@CurrentUserId() userId: string) {
    return this.users.getUser(userId);
  }

  @Patch()
  update(@CurrentUserId() userId: string, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(userId, dto);
  }

  @Delete()
  @HttpCode(204)
  async remove(@CurrentUserId() userId: string, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.deletion.deleteUser(userId);
    this.cookies.clear(res, 'user');
  }

  @Get('settings')
  settings(@CurrentUserId() userId: string) {
    return this.users.getSettings(userId);
  }

  @Patch('settings')
  async updateSettings(@CurrentUserId() userId: string, @Body() dto: UpdateUserSettingsDto) {
    const { settings, reschedule } = await this.users.updateSettings(userId, dto);
    if (reschedule) await this.scheduler.rescheduleUser(userId);
    return settings;
  }
}
