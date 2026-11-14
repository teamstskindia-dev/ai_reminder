import { Body, Controller, Delete, Get, HttpCode, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { ThrottleByUser } from '../../common/decorators/metadata.decorators';
import { ApiDataResponse, ApiErrors } from '../../common/swagger/api-docs.decorators';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { User } from '../users/dto/users.responses.dto';
import { OnboardingChatDto, OnboardingChatReply, TranscriptionResult, UserProfile } from './onboarding.dto';
import { MAX_VOICE_NOTE_BYTES, OnboardingService } from './onboarding.service';

@ApiTags('onboarding')
@UserAuth()
@ThrottleByUser()
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('chat')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Next message in the get-to-know-you chat',
    description:
      'Send the conversation so far (empty for the opening message). The friend asks four short questions ' +
      '(name, what you do, what is on your mind, how you like to be talked to) and mirrors English, Hinglish ' +
      'or a mix. When `done` is true, call `POST /onboarding/profile`. Rate limit: 30 requests per minute per user.',
  })
  @ApiDataResponse(OnboardingChatReply)
  chat(@CurrentUserId() userId: string, @Body() dto: OnboardingChatDto) {
    return this.onboarding.chat(userId, dto.messages);
  }

  @Post('profile')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Build the first personality profile from the chat',
    description:
      'Extracts only what the user said (name, work, current focus, style, language, facts). With no answers ' +
      'the profile is marked `skipped`. Rate limit: 5 requests per minute per user.',
  })
  @ApiDataResponse(UserProfile)
  profile(@CurrentUserId() userId: string, @Body() dto: OnboardingChatDto) {
    return this.onboarding.buildProfile(userId, dto.messages);
  }

  @Post('transcribe')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Transcribe a short voice answer',
    description:
      'Audio (m4a, mp3, wav, webm, ogg; up to 15 MB). English, Hindi and Hinglish are written the way people ' +
      'text. The audio is not stored. Rate limit: 10 requests per minute per user.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary', description: 'Voice note.' } },
    },
  })
  @ApiDataResponse(TranscriptionResult)
  @ApiErrors('PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE', 'UPSTREAM_ERROR')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_VOICE_NOTE_BYTES, files: 1, fields: 2, parts: 3 },
    }),
  )
  transcribe(@UploadedFile() file: { originalname?: string; buffer: Buffer } | undefined) {
    return this.onboarding.transcribe(file);
  }

  @Post('complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Finish first-run onboarding',
    description:
      'Sets `onboardedAt` (idempotent), marks an unfinished profile as skipped and sends the welcome email the ' +
      'first time.',
  })
  @ApiDataResponse(User)
  complete(@CurrentUserId() userId: string) {
    return this.onboarding.complete(userId);
  }
}

@ApiTags('me')
@UserAuth()
@Controller('me/profile')
export class ProfileController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  @ApiOperation({ summary: 'What the friend knows about you (personality profile)' })
  @ApiDataResponse(UserProfile)
  get(@CurrentUserId() userId: string) {
    return this.onboarding.getProfile(userId);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Forget the personality profile' })
  @ApiNoContentResponse({ description: 'Profile deleted.' })
  async remove(@CurrentUserId() userId: string): Promise<void> {
    await this.onboarding.resetProfile(userId);
  }
}
