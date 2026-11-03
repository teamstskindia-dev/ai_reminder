import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { CreateReminderDto, ListRemindersQueryDto, SnoozeReminderDto, UpdateReminderDto } from './dto/reminders.dto';
import { RemindersService } from './reminders.service';

@ApiTags('reminders')
@UserAuth()
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  list(@CurrentUserId() userId: string, @Query() q: ListRemindersQueryDto) {
    return this.reminders.list(userId, q);
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() dto: CreateReminderDto) {
    return this.reminders.create(userId, dto);
  }

  @Patch(':id')
  update(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReminderDto) {
    return this.reminders.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.reminders.remove(userId, id);
  }

  @Post(':id/snooze')
  @HttpCode(200)
  snooze(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SnoozeReminderDto) {
    return this.reminders.snooze(userId, id, dto.minutes);
  }
}
