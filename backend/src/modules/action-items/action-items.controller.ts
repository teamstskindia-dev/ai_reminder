import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiDataResponse, ApiErrors, ApiPaginatedResponse } from '../../common/swagger/api-docs.decorators';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { CreateActionItemDto, ListActionItemsQueryDto, UpdateActionItemDto } from './action-items.dto';
import { ActionItem } from './action-items.responses.dto';
import { ActionItemsService } from './action-items.service';

@ApiTags('action-items')
@UserAuth()
@Controller('action-items')
export class ActionItemsController {
  constructor(private readonly items: ActionItemsService) {}

  @Get()
  @ApiOperation({ summary: 'List action items' })
  @ApiPaginatedResponse(ActionItem)
  list(@CurrentUserId() userId: string, @Query() q: ListActionItemsQueryDto) {
    return this.items.list(userId, q);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an action item',
    description: 'With `remind: true` a reminder is scheduled at `dueAt`, which must then be in the future.',
  })
  @ApiDataResponse(ActionItem, { status: 201 })
  @ApiErrors('NOT_FOUND')
  create(@CurrentUserId() userId: string, @Body() dto: CreateActionItemDto) {
    return this.items.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an action item (title, due date, priority, status)' })
  @ApiDataResponse(ActionItem)
  @ApiErrors('NOT_FOUND')
  update(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateActionItemDto) {
    return this.items.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an action item and its pending reminders' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND')
  async remove(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.items.remove(userId, id);
  }
}
