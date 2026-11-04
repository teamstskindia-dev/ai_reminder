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
import { ApiBody, ApiConsumes, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { MAX_AUDIO_BYTES } from '../../common/files/file-validation';
import { ApiDataResponse, ApiErrors, ApiPaginatedResponse } from '../../common/swagger/api-docs.decorators';
import { QueuedResult } from '../../common/swagger/common-results.dto';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { CreateMeetingDto, ListMeetingsQueryDto, UpdateMeetingDto, UploadMeetingDto } from './dto/meetings.dto';
import { MeetingDetail, MeetingListItem, TranscriptSegment } from './dto/meetings.responses.dto';
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
  @ApiOperation({ summary: 'List meetings', description: 'Filter by scope, status, title search and start time.' })
  @ApiPaginatedResponse(MeetingListItem)
  list(@CurrentUserId() userId: string, @Query() q: ListMeetingsQueryDto) {
    return this.meetings.list(userId, q);
  }

  @Post('upload')
  @ApiOperation({
    summary: 'Upload a recording or transcript',
    description:
      'Audio (mp3, m4a, wav, webm, ogg; up to 200 MB) is transcribed by AI. A `.txt`/`.vtt`/`.srt` transcript ' +
      '(up to 5 MB) is parsed directly. Either way the meeting is created and the AI report is queued.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'title'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Audio recording or transcript file.' },
        title: { type: 'string', minLength: 1, maxLength: 300 },
        startAt: { type: 'string', format: 'date-time', description: 'When the meeting happened. Defaults to now.' },
      },
    },
  })
  @ApiDataResponse(MeetingDetail, { status: 201 })
  @ApiErrors('FORBIDDEN', 'PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE')
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
  @ApiOperation({ summary: 'Get a meeting with its report, participants and action items' })
  @ApiDataResponse(MeetingDetail)
  @ApiErrors('NOT_FOUND')
  get(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.get(userId, id);
  }

  @Get(':id/transcript')
  @ApiOperation({ summary: 'Get the full transcript, in order' })
  @ApiDataResponse(TranscriptSegment, { isArray: true })
  @ApiErrors('NOT_FOUND')
  transcript(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.transcript(userId, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Add a Google Meet meeting by link',
    description: 'With `autoJoin` the bot is scheduled to join at `startAt` (within the plan limit).',
  })
  @ApiDataResponse(MeetingDetail, { status: 201 })
  create(@CurrentUserId() userId: string, @Body() dto: CreateMeetingDto) {
    return this.meetings.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a meeting or turn auto-join on or off' })
  @ApiDataResponse(MeetingDetail)
  @ApiErrors('NOT_FOUND')
  update(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMeetingDto) {
    return this.meetings.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a meeting with its transcript, report and recording' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND')
  async remove(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.meetings.remove(userId, id);
  }

  @Post(':id/bot/join')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send the bot into the meeting now' })
  @ApiDataResponse(MeetingDetail)
  @ApiErrors('NOT_FOUND', 'CONFLICT', 'PLAN_LIMIT_REACHED')
  join(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.joinBot(userId, id);
  }

  @Post(':id/bot/leave')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Make the bot leave, or cancel its scheduled join',
    description:
      'If the bot is in the meeting it leaves and what was captured is processed. If it was only ' +
      'scheduled, the join is cancelled and auto-join is turned off.',
  })
  @ApiDataResponse(MeetingDetail)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  leave(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.leaveBot(userId, id);
  }

  @Post(':id/reprocess')
  @HttpCode(200)
  @ApiOperation({ summary: 'Regenerate the AI report from the transcript' })
  @ApiDataResponse(QueuedResult)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  reprocess(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.reprocess(userId, id);
  }
}
