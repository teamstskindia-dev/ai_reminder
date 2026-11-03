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
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { MAX_IMAGE_BYTES } from '../../common/files/file-validation';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import type { AdminRow } from '../../infra/prisma/models';
import { AdminAuth, CurrentAdmin } from '../auth/auth.decorators';
import { ContentCacheService } from '../content/content-cache.service';
import { MediaService } from '../media/media.service';
import { AdminAdminsService } from './admin-admins.service';
import { AdminMiscService } from './admin-misc.service';
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
import { QueueAdminService } from './queue-admin.service';

const KEY_RE = /^[a-z][a-z0-9_]{0,60}$/;

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
  listMedia(@Query() q: MediaQueryDto) {
    return this.media.list(q);
  }

  @Post('media/upload')
  @AdminAuth('editor')
  @Audited('media.upload', 'media_assets')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' }, folder: { type: 'string' }, alt: { type: 'string' } },
    },
  })
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
  updateMedia(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMediaDto) {
    return this.media.updateAlt(id, dto.alt ?? null);
  }

  @Delete('media/:id')
  @HttpCode(204)
  @AdminAuth('editor')
  @Audited('media.delete', 'media_assets')
  async deleteMedia(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.media.remove(id);
  }

  // ---------- AI ----------
  @Get('ai/prompts')
  prompts() {
    return this.misc.listPrompts();
  }

  @Put('ai/prompts/:key')
  @AdminAuth('admin')
  @Audited('prompt.update', 'ai_prompts')
  putPrompt(@CurrentAdmin() admin: AdminRow, @Param('key') key: string, @Body() dto: PutPromptDto) {
    return this.misc.putPrompt(KEY_RE.test(key) ? key : '', dto, admin.id);
  }

  @Post('ai/test')
  @HttpCode(200)
  @AdminAuth('admin')
  aiTest(@Body() dto: AiTestDto) {
    return this.misc.testReport(dto.transcript, dto.title);
  }

  // ---------- notification templates ----------
  @Get('notification-templates')
  templates() {
    return this.misc.listTemplates();
  }

  @Put('notification-templates/:key')
  @AdminAuth('admin')
  @Audited('template.update', 'notification_templates')
  putTemplate(@CurrentAdmin() admin: AdminRow, @Param('key') key: string, @Body() dto: PutTemplateDto) {
    return this.misc.putTemplate(KEY_RE.test(key) ? key : '', dto, admin.id);
  }

  // ---------- broadcasts ----------
  @Get('broadcasts')
  broadcasts(@Query() q: PaginationQueryDto) {
    return this.misc.listBroadcasts(q.page, q.limit);
  }

  @Post('broadcasts')
  @AdminAuth('admin')
  @Audited('broadcast.create', 'broadcasts')
  createBroadcast(@CurrentAdmin() admin: AdminRow, @Body() dto: CreateBroadcastDto) {
    return this.misc.createBroadcast(dto, admin.id);
  }

  // ---------- admins ----------
  @Get('admins')
  @AdminAuth('super_admin')
  listAdmins() {
    return this.admins.list();
  }

  @Post('admins')
  @AdminAuth('super_admin')
  @Audited('admin.create', 'admins')
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.admins.create(dto);
  }

  @Patch('admins/:id')
  @AdminAuth('super_admin')
  @Audited('admin.update', 'admins')
  updateAdmin(@CurrentAdmin() actor: AdminRow, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAdminDto) {
    return this.admins.update(actor, id, dto);
  }

  @Delete('admins/:id')
  @HttpCode(204)
  @AdminAuth('super_admin')
  @Audited('admin.delete', 'admins')
  async deleteAdmin(@CurrentAdmin() actor: AdminRow, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.admins.remove(actor, id);
  }

  // ---------- audit + system ----------
  @Get('audit-logs')
  @AdminAuth('admin')
  auditLogs(@Query() q: AuditLogsQueryDto) {
    return this.misc.auditLogs(q);
  }

  @Get('system/queues')
  queueStats() {
    return this.queues.stats();
  }

  @Get('system/queues/:name/failed')
  @AdminAuth('admin')
  failed(@Param('name') name: string, @Query() q: PaginationQueryDto) {
    return this.queues.failed(name, q.page, q.limit);
  }

  @Post('system/queues/:name/retry-failed')
  @HttpCode(200)
  @AdminAuth('admin')
  @Audited('queue.retry_failed', 'queues')
  retry(@Param('name') name: string) {
    return this.queues.retryFailed(name);
  }

  @Post('system/cache/flush')
  @HttpCode(200)
  @AdminAuth('admin')
  @Audited('cache.flush', 'cache')
  async flush() {
    return { flushed: await this.cache.invalidate('manual flush') };
  }
}
