import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { CreateActionItemDto, ListActionItemsQueryDto, UpdateActionItemDto } from './action-items.dto';
import { ActionItemsService } from './action-items.service';

@ApiTags('action-items')
@UserAuth()
@Controller('action-items')
export class ActionItemsController {
  constructor(private readonly items: ActionItemsService) {}

  @Get()
  list(@CurrentUserId() userId: string, @Query() q: ListActionItemsQueryDto) {
    return this.items.list(userId, q);
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() dto: CreateActionItemDto) {
    return this.items.create(userId, dto);
  }

  @Patch(':id')
  update(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateActionItemDto) {
    return this.items.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.items.remove(userId, id);
  }
}
