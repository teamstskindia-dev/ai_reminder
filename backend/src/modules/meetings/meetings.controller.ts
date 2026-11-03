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
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { MAX_AUDIO_BYTES } from '../../common/files/file-validation';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { CreateMeetingDto, ListMeetingsQueryDto, UpdateMeetingDto, UploadMeetingDto } from './dto/meetings.dto';
import { MeetingsService } from './meetings.service';
import { UploadService } from './upload.service';
import type { UploadedFile as UploadedFileType } from './upload.service';

@ApiTags('meetings')
@UserAuth()
@Controller('meetings')
export class MeetingsController {
  constructor(
    private readonly meetings: MeetingsService,
    private readonly uploads: UploadService,
  ) {}

  @Get()
  list(@CurrentUserId() userId: string, @Query() q: ListMeetingsQueryDto) {
    return this.meetings.list(userId, q);
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'title'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        startAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 5, fieldSize: 16 * 1024, parts: 8 },
    }),
  )
  upload(
    @CurrentUserId() userId: string,
    @Body() dto: UploadMeetingDto,
    @UploadedFile() file: UploadedFileType | undefined,
  ) {
    return this.uploads.upload(userId, dto, file);
  }

  @Get(':id')
  get(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.get(userId, id);
  }

  @Get(':id/transcript')
  transcript(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.transcript(userId, id);
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() dto: CreateMeetingDto) {
    return this.meetings.create(userId, dto);
  }

  @Patch(':id')
  update(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMeetingDto) {
    return this.meetings.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.meetings.remove(userId, id);
  }

  @Post(':id/bot/join')
  @HttpCode(200)
  join(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.joinBot(userId, id);
  }

  @Post(':id/bot/leave')
  @HttpCode(200)
  leave(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.leaveBot(userId, id);
  }

  @Post(':id/reprocess')
  @HttpCode(200)
  reprocess(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.reprocess(userId, id);
  }
}
