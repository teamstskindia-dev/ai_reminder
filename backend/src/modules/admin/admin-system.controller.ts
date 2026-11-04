import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { MAX_IMAGE_BYTES } from '../../common/files/file-validation';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { ApiDataResponse, ApiErrors, ApiPaginatedResponse } from '../../common/swagger/api-docs.decorators';
import { QUEUE_NAMES } from '../../common/types/api.types';
import type { AdminRow } from '../../infra/prisma/models';
import { AdminAuth, CurrentAdmin } from '../auth/auth.decorators';
import { ContentCacheService } from '../content/content-cache.service';
import { MediaService } from '../media/media.service';
import { AdminAdminsService } from './admin-admins.service';
import { AdminMiscService, KNOWN_PROMPT_KEYS } from './admin-misc.service';
import { Audited, AuditInterceptor } from './audit';
import {
  AiTestDto,
  AuditLogsQueryDto,
  CreateAdminDto,
  CreateBroadcastDto,
  MediaQueryDto,
  PutPromptDto,
  PutTemplateDto,
  UpdateAdminDto,
  UpdateMediaDto,
  UploadMediaDto,
} from './dto/admin.dto';
import {
  AdminUser,
  AiPrompt,
  AiTestResult,
  AuditLog,
  Broadcast,
  FailedJob,
  FlushResult,
  MediaAsset,
  NotificationTemplate,
  QueueStats,
  RetriedResult,
} from './dto/admin.responses.dto';
import { QueueAdminService } from './queue-admin.service';

const KEY_RE = /^[a-z][a-z0-9_]{0,60}$/;
const QUEUE_PARAM = { name: 'name', enum: QUEUE_NAMES };

@ApiTags('admin: system')
@AdminAuth('viewer')
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminSystemController {
  constructor(
    private readonly misc: AdminMiscService,
    private readonly media: MediaService,
    private readonly admins: AdminAdminsService,
    private readonly queues: QueueAdminService,
    private readonly cache: ContentCacheService,
  ) {}

  // ---------- media ----------
  @Get('media')
  @ApiOperation({ summary: 'List uploaded media, newest first' })
  @ApiPaginatedResponse(MediaAsset)
  listMedia(@Query() q: MediaQueryDto) {
    return this.media.list(q);
  }

  @Post('media/upload')
  @AdminAuth('editor')
  @Audited('media.upload', 'media_assets')
  @ApiOperation({
    summary: 'Upload an image to Cloudinary',
    description: 'PNG, JPG, WebP, GIF or ICO up to 10 MB. SVG is rejected. The file type is checked from its content.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,40}$', example: 'branding' },
        alt: { type: 'string', maxLength: 300 },
      },
    },
  })
  @ApiDataResponse(MediaAsset, { status: 201 })
  @ApiErrors('PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE', 'UPSTREAM_ERROR')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 4, parts: 6 },
    }),
  )
  upload(
    @CurrentAdmin() admin: AdminRow,
    @Body() dto: UploadMediaDto,
    @UploadedFile() file: { originalname?: string; buffer: Buffer } | undefined,
  ) {
    return this.media.upload(file, dto, admin.id);
  }

  @Patch('media/:id')
  @AdminAuth('editor')
  @Audited('media.update', 'media_assets')
  @ApiOperation({ summary: 'Set or clear the alt text of an image' })
  @ApiDataResponse(MediaAsset)
  @ApiErrors('NOT_FOUND')
  updateMedia(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMediaDto) {
    return this.media.updateAlt(id, dto.alt ?? null);
  }

  @Delete('media/:id')
  @HttpCode(204)
  @AdminAuth('editor')
  @Audited('media.delete', 'media_assets')
  @ApiOperation({ summary: 'Delete an image (also from Cloudinary)' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND')
  async deleteMedia(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.media.remove(id);
  }

  // ---------- AI ----------
  @Get('ai/prompts')
  @ApiOperation({ summary: 'List AI prompts' })
  @ApiDataResponse(AiPrompt, { isArray: true })
  prompts() {
    return this.misc.listPrompts();
  }

  @Put('ai/prompts/:key')
  @AdminAuth('admin')
  @Audited('prompt.update', 'ai_prompts')
  @ApiOperation({ summary: 'Update an AI prompt (bumps its version)' })
  @ApiParam({ name: 'key', enum: KNOWN_PROMPT_KEYS })
  @ApiDataResponse(AiPrompt)
  @ApiErrors('NOT_FOUND')
  putPrompt(@CurrentAdmin() admin: AdminRow, @Param('key') key: string, @Body() dto: PutPromptDto) {
    return this.misc.putPrompt(KEY_RE.test(key) ? key : '', dto, admin.id);
  }

  @Post('ai/test')
  @HttpCode(200)
  @AdminAuth('admin')
  @ApiOperation({
    summary: 'Try the meeting-report prompt on a pasted transcript',
    description: 'Runs the current prompt and returns the report, action items and reminders. Nothing is saved.',
  })
  @ApiDataResponse(AiTestResult)
  @ApiErrors('UPSTREAM_ERROR')
  aiTest(@Body() dto: AiTestDto) {
    return this.misc.testReport(dto.transcript, dto.title);
  }

  // ---------- notification templates ----------
  @Get('notification-templates')
  @ApiOperation({ summary: 'List notification templates' })
  @ApiDataResponse(NotificationTemplate, { isArray: true })
  templates() {
    return this.misc.listTemplates();
  }

  @Put('notification-templates/:key')
  @AdminAuth('admin')
  @Audited('template.update', 'notification_templates')
  @ApiOperation({ summary: 'Update a notification template' })
  @ApiParam({ name: 'key', schema: { type: 'string', pattern: KEY_RE.source }, example: 'meeting_upcoming' })
  @ApiDataResponse(NotificationTemplate)
  @ApiErrors('NOT_FOUND')
  putTemplate(@CurrentAdmin() admin: AdminRow, @Param('key') key: string, @Body() dto: PutTemplateDto) {
    return this.misc.putTemplate(KEY_RE.test(key) ? key : '', dto, admin.id);
  }

  // ---------- broadcasts ----------
  @Get('broadcasts')
  @ApiOperation({ summary: 'List sent broadcasts, newest first' })
  @ApiPaginatedResponse(Broadcast)
  broadcasts(@Query() q: PaginationQueryDto) {
    return this.misc.listBroadcasts(q.page, q.limit);
  }

  @Post('broadcasts')
  @AdminAuth('admin')
  @Audited('broadcast.create', 'broadcasts')
  @ApiOperation({
    summary: 'Send a broadcast notification',
    description: 'Delivered in the background to everyone, to listed users, or to the users of one plan.',
  })
  @ApiDataResponse(Broadcast, { status: 201 })
  @ApiErrors('NOT_FOUND')
  createBroadcast(@CurrentAdmin() admin: AdminRow, @Body() dto: CreateBroadcastDto) {
    return this.misc.createBroadcast(dto, admin.id);
  }

  // ---------- admins ----------
  @Get('admins')
  @AdminAuth('super_admin')
  @ApiOperation({ summary: 'List admin accounts' })
  @ApiDataResponse(AdminUser, { isArray: true })
  listAdmins() {
    return this.admins.list();
  }

  @Post('admins')
  @AdminAuth('super_admin')
  @Audited('admin.create', 'admins')
  @ApiOperation({ summary: 'Create an admin account' })
  @ApiDataResponse(AdminUser, { status: 201 })
  @ApiErrors('CONFLICT')
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.admins.create(dto);
  }

  @Patch('admins/:id')
  @AdminAuth('super_admin')
  @Audited('admin.update', 'admins')
  @ApiOperation({
    summary: 'Update an admin (name, role, status, password)',
    description: 'You cannot demote or disable yourself or the last active super admin (`CONFLICT`).',
  })
  @ApiDataResponse(AdminUser)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  updateAdmin(@CurrentAdmin() actor: AdminRow, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAdminDto) {
    return this.admins.update(actor, id, dto);
  }

  @Delete('admins/:id')
  @HttpCode(204)
  @AdminAuth('super_admin')
  @Audited('admin.delete', 'admins')
  @ApiOperation({
    summary: 'Delete an admin',
    description: 'You cannot delete yourself or the last active super admin (`CONFLICT`).',
  })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  async deleteAdmin(@CurrentAdmin() actor: AdminRow, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.admins.remove(actor, id);
  }

  // ---------- audit + system ----------
  @Get('audit-logs')
  @AdminAuth('admin')
  @ApiOperation({ summary: 'List admin audit log entries, newest first' })
  @ApiPaginatedResponse(AuditLog)
  auditLogs(@Query() q: AuditLogsQueryDto) {
    return this.misc.auditLogs(q);
  }

  @Get('system/queues')
  @ApiOperation({ summary: 'Get job counts for every background queue' })
  @ApiDataResponse(QueueStats, { isArray: true })
  queueStats() {
    return this.queues.stats();
  }

  @Get('system/queues/:name/failed')
  @AdminAuth('admin')
  @ApiOperation({
    summary: 'List failed jobs of a queue',
    description: 'Sensitive fields of the job payload (tokens, secrets, bodies) are replaced with `[omitted]`.',
  })
  @ApiParam(QUEUE_PARAM)
  @ApiPaginatedResponse(FailedJob)
  @ApiErrors('NOT_FOUND')
  failed(@Param('name') name: string, @Query() q: PaginationQueryDto) {
    return this.queues.failed(name, q.page, q.limit);
  }

  @Post('system/queues/:name/retry-failed')
  @HttpCode(200)
  @AdminAuth('admin')
  @Audited('queue.retry_failed', 'queues')
  @ApiOperation({ summary: 'Retry every failed job of a queue' })
  @ApiParam(QUEUE_PARAM)
  @ApiDataResponse(RetriedResult)
  @ApiErrors('NOT_FOUND')
  retry(@Param('name') name: string) {
    return this.queues.retryFailed(name);
  }

  @Post('system/cache/flush')
  @HttpCode(200)
  @AdminAuth('admin')
  @Audited('cache.flush', 'cache')
  @ApiOperation({ summary: 'Flush the content cache (settings, sections, navigation, plans)' })
  @ApiDataResponse(FlushResult)
  async flush() {
    return { flushed: await this.cache.invalidate('manual flush') };
  }
}
