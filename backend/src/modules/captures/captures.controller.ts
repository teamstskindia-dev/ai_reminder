import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { ThrottleByUser } from '../../common/decorators/metadata.decorators';
import { MB } from '../../common/files/file-validation';
import { ApiDataResponse, ApiErrors } from '../../common/swagger/api-docs.decorators';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import {
  CaptureDetail,
  CaptureListItem,
  CapturePartResult,
  CreateCaptureDto,
  FinishCaptureDto,
  FollowUpDecisionDto,
  ListCapturesQueryDto,
  ReviewCaptureDto,
  UpdateCaptureDto,
  UploadCapturePartDto,
} from './captures.dto';
import { CapturesService, type UploadedPart } from './captures.service';

/** One part is about 5 minutes of speech (~2.5 MB); the cap leaves plenty of room. */
const MAX_PART_BYTES = 50 * MB;

@ApiTags('captures')
@UserAuth()
@Controller('captures')
export class CapturesController {
  constructor(private readonly captures: CapturesService) {}

  @Get()
  @ApiOperation({
    summary: 'List recent recorded conversations',
    description: 'Newest first. The Today screen uses it for "processing" and "ready to review" cards.',
  })
  @ApiDataResponse(CaptureListItem, { isArray: true })
  list(@CurrentUserId() userId: string, @Query() q: ListCapturesQueryDto) {
    return this.captures.list(userId, q.limit);
  }

  @Post()
  @ApiOperation({
    summary: 'Start sending a recorded conversation',
    description:
      'Creates the recording in status `uploading`. Idempotent on `clientId` (the phone retries from its ' +
      'offline queue): calling it again returns the same recording. Then upload each part and call finish.',
  })
  @ApiDataResponse(CaptureDetail, { status: 201 })
  create(@CurrentUserId() userId: string, @Body() dto: CreateCaptureDto) {
    return this.captures.create(userId, dto);
  }

  @Put(':id/parts/:index')
  @ThrottleByUser()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Upload one part of the recording',
    description:
      'The app records in parts of about 5 minutes so a crash loses at most the current part. Audio ' +
      '(m4a, mp3, wav, webm, ogg; up to 50 MB per part). Uploading the same index again replaces it.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'durationMs'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Audio of this part.' },
        durationMs: { type: 'integer', minimum: 0, description: 'Length of this part in milliseconds.' },
      },
    },
  })
  @ApiDataResponse(CapturePartResult)
  @ApiErrors('NOT_FOUND', 'CONFLICT', 'PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PART_BYTES, files: 1, fields: 2, parts: 3 },
    }),
  )
  uploadPart(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() dto: UploadCapturePartDto,
    @UploadedFile() file: UploadedPart | undefined,
  ) {
    return this.captures.uploadPart(userId, id, index, dto, file);
  }

  @Post(':id/finish')
  @HttpCode(200)
  @ThrottleByUser()
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Finish sending and start processing',
    description:
      'Checks that parts 0..partCount-1 are all uploaded, saves the title, length and bookmarks, and queues ' +
      'transcription (English and Hinglish), the summary and extraction. Calling it again is harmless. A ' +
      '`capture_ready` notification follows; raw audio is deleted after processing. At most 60 per user per hour.',
  })
  @ApiDataResponse(CaptureDetail)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  finish(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FinishCaptureDto) {
    return this.captures.finish(userId, id, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a recorded conversation (the review card)',
    description: 'Status, summary, to-dos, reminders, people, facts, mood and the reminders waiting for a decision.',
  })
  @ApiDataResponse(CaptureDetail)
  @ApiErrors('NOT_FOUND')
  get(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.captures.get(userId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Rename a recording, or link it to a calendar meeting',
    description:
      'With `linkedMeetingId` the recording belongs to that calendar meeting: its attendees are copied and, once ' +
      'processed, a follow-up email is drafted. `linkedMeetingId: null` keeps it standalone.',
  })
  @ApiDataResponse(CaptureDetail)
  @ApiErrors('NOT_FOUND')
  update(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCaptureDto) {
    return this.captures.update(userId, id, dto);
  }

  @Post(':id/follow-up')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Record what happened to the follow-up email',
    description:
      "The app opens the user's own email app with the approved draft; nothing is sent by the server. " +
      'Call with `sent` (optionally the edited subject and body) or `skipped`.',
  })
  @ApiDataResponse(CaptureDetail)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  followUp(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FollowUpDecisionDto) {
    return this.captures.followUpDecision(userId, id, dto);
  }

  @Post(':id/review')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Save the review card',
    description:
      'Confirm (optionally with a fixed title and time) or dismiss each unclear reminder, and choose which ' +
      'facts about the user to remember. Confirmed reminders are scheduled. Marks the recording reviewed.',
  })
  @ApiDataResponse(CaptureDetail)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  review(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewCaptureDto) {
    return this.captures.review(userId, id, dto);
  }

  @Post(':id/retry')
  @HttpCode(200)
  @ThrottleByUser()
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Process a failed recording again',
    description: 'The audio is kept after a failure. At most 10 per user per hour.',
  })
  @ApiDataResponse(CaptureDetail)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  retry(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.captures.retry(userId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a recorded conversation',
    description: 'Removes the audio (if still kept), transcript, summary and to-dos; pending reminders are cancelled.',
  })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND')
  async remove(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.captures.remove(userId, id);
  }
}
