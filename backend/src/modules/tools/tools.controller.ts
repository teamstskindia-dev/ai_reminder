import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ThrottleByUser } from '../../common/decorators/metadata.decorators';
import { ApiDataResponse, ApiErrors } from '../../common/swagger/api-docs.decorators';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { IntegrationTarget } from '../users/dto/users.responses.dto';
import { CreateToolTaskDto, ListToolTasksQueryDto, ToolTask, ToolTaskResult } from './tools.dto';
import { ToolTasksService } from './tool-tasks.service';

@ApiTags('tools')
@UserAuth()
@Controller('tools')
export class ToolsController {
  constructor(private readonly tasks: ToolTasksService) {}

  @Get('tasks')
  @ApiOperation({ summary: 'Tasks sent to Notion, Jira, Linear or Todoist (newest first)' })
  @ApiDataResponse(ToolTask, { isArray: true })
  list(@CurrentUserId() userId: string, @Query() q: ListToolTasksQueryDto) {
    return this.tasks.list(userId, q.actionItemId);
  }

  @Post('tasks')
  @HttpCode(200)
  @ThrottleByUser()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Send a task to a connected tool',
    description:
      'Only after the user tapped Send (or turned auto-send on). Returns `duplicate` without creating anything when a ' +
      'similar open task exists: call again with `mergeWithExternalId` or `force: true`. A tool that is down or needs ' +
      'a reconnect returns `queued`: the to-do stays in the app and is retried.',
  })
  @ApiDataResponse(ToolTaskResult)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  create(@CurrentUserId() userId: string, @Body() dto: CreateToolTaskDto) {
    return this.tasks.create(userId, {
      provider: dto.provider,
      actionItemId: dto.actionItemId,
      title: dto.title,
      details: dto.details,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      ownerName: dto.ownerName,
      source: dto.source ?? 'manual',
      force: dto.force,
      mergeWithExternalId: dto.mergeWithExternalId,
    });
  }

  @Get(':provider/targets')
  @ApiOperation({
    summary: 'Projects a connected tool can create tasks in',
    description: 'Notion databases shared with the app, Jira projects, Linear teams or Todoist projects.',
  })
  @ApiDataResponse(IntegrationTarget, { isArray: true })
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  targets(@CurrentUserId() userId: string, @Param('provider') provider: string) {
    return this.tasks.targets(userId, provider);
  }
}
