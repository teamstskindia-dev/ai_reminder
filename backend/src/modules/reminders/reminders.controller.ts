import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiDataResponse, ApiErrors, ApiPaginatedResponse } from '../../common/swagger/api-docs.decorators';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { CreateReminderDto, ListRemindersQueryDto, SnoozeReminderDto, UpdateReminderDto } from './dto/reminders.dto';
import { Reminder } from './dto/reminders.responses.dto';
import { RemindersService } from './reminders.service';

@ApiTags('reminders')
@UserAuth()
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  @ApiOperation({ summary: 'List reminders', description: 'Defaults to pending reminders.' })
  @ApiPaginatedResponse(Reminder)
  list(@CurrentUserId() userId: string, @Query() q: ListRemindersQueryDto) {
    return this.reminders.list(userId, q);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a reminder',
    description: '`remindAt` must be in the future. It can be linked to one of your meetings or action items.',
  })
  @ApiDataResponse(Reminder, { status: 201 })
  @ApiErrors('NOT_FOUND')
  create(@CurrentUserId() userId: string, @Body() dto: CreateReminderDto) {
    return this.reminders.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a reminder, or cancel it with `status: "cancelled"`' })
  @ApiDataResponse(Reminder)
  @ApiErrors('NOT_FOUND')
  update(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReminderDto) {
    return this.reminders.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a reminder' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND')
  async remove(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.reminders.remove(userId, id);
  }

  @Post(':id/snooze')
  @HttpCode(200)
  @ApiOperation({ summary: 'Snooze a reminder', description: 'Sets `remindAt` to now + `minutes` and re-arms it.' })
  @ApiDataResponse(Reminder)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  snooze(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SnoozeReminderDto) {
    return this.reminders.snooze(userId, id, dto.minutes);
  }
}
