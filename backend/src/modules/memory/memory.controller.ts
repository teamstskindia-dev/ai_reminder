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
  Query,
  Res,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ThrottleByUser } from '../../common/decorators/metadata.decorators';
import { ApiDataResponse, ApiErrors } from '../../common/swagger/api-docs.decorators';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import {
  CorrectionQueryDto,
  CreatePersonDto,
  DataExportStatus,
  FixNameDto,
  MemorySearch,
  MemorySearchQueryDto,
  MemoryTimeline,
  NameCorrection,
  NameFixResult,
  PeopleQueryDto,
  PersonDetail,
  PersonListItem,
  SegmentUpdated,
  SummaryUpdated,
  TimelineQueryDto,
  UpdatePersonDto,
  UpdateSegmentDto,
  UpdateSummaryDto,
} from './memory.dto';
import { MemoryService } from './memory.service';
import { NameFixService } from './name-fix.service';
import { PeopleService } from './people.service';
import { PrivacyService } from './privacy.service';

/** Memory (user-flow §10): timeline, people, search by meaning and fixing what the friend got wrong. */
@ApiTags('memory')
@UserAuth()
@ThrottleByUser()
@Controller('memory')
export class MemoryController {
  constructor(
    private readonly memory: MemoryService,
    private readonly people: PeopleService,
    private readonly nameFix: NameFixService,
  ) {}

  @Get('timeline')
  @ApiOperation({
    summary: 'Memory timeline',
    description: 'Conversations, check-in highlights and email summaries grouped by local day, newest first.',
  })
  @ApiDataResponse(MemoryTimeline)
  timeline(@CurrentUserId() userId: string, @Query() q: TimelineQueryDto) {
    return this.memory.timeline(userId, q.before);
  }

  @Get('search')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Search memory by meaning',
    description:
      'Semantic search over conversations plus word matches in check-ins and email summaries. When nothing ' +
      'matches, `results` is empty and `related` suggests memories to look at instead.',
  })
  @ApiDataResponse(MemorySearch)
  search(@CurrentUserId() userId: string, @Query() q: MemorySearchQueryDto) {
    return this.memory.search(userId, q.q);
  }

  // ---------- people ----------

  @Get('people')
  @ApiOperation({
    summary: 'People cards',
    description: 'Most recently talked to first. Built from past conversations on first visit.',
  })
  @ApiDataResponse(PersonListItem, { isArray: true })
  listPeople(@CurrentUserId() userId: string, @Query() q: PeopleQueryDto) {
    return this.people.list(userId, q.q);
  }

  @Post('people')
  @ApiOperation({ summary: 'Add a person card' })
  @ApiDataResponse(PersonDetail, { status: 201 })
  @ApiErrors('VALIDATION_ERROR', 'CONFLICT')
  createPerson(@CurrentUserId() userId: string, @Body() dto: CreatePersonDto) {
    return this.people.create(userId, dto);
  }

  @Get('people/:id')
  @ApiOperation({
    summary: 'A person card',
    description: 'Relationship, last talked, key facts, promises both ways and the conversations with them.',
  })
  @ApiDataResponse(PersonDetail)
  @ApiErrors('NOT_FOUND')
  getPerson(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.people.get(userId, id);
  }

  @Patch('people/:id')
  @ApiOperation({
    summary: 'Fix a person card',
    description:
      'A new name is fixed in every conversation with them and remembered for future transcripts; the old ' +
      'name stays as another spelling. If a card with the new name exists, the two are merged.',
  })
  @ApiDataResponse(PersonDetail)
  @ApiErrors('NOT_FOUND', 'VALIDATION_ERROR')
  async updatePerson(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePersonDto,
  ) {
    await this.people.updateDetails(userId, id, { relationship: dto.relationship, facts: dto.facts });
    if (dto.name !== undefined) {
      const before = await this.people.require(userId, id);
      await this.nameFix.renamePerson(userId, id, dto.name);
      // Merged into an existing card with that name: return that one.
      const after = (await this.people.findByName(userId, dto.name)) ?? before;
      return this.people.get(userId, after.id);
    }
    return this.people.get(userId, id);
  }

  @Delete('people/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Forget a person card',
    description: 'Conversations stay; the card, its facts and spellings go.',
  })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND')
  async removePerson(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.people.remove(userId, id);
  }

  // ---------- fixing a conversation ----------

  @Post('conversations/:id/fix-name')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Fix a name or speaker',
    description:
      'Renames a speaker or a misheard name in the transcript, summary, to-dos and reminders. A real name is ' +
      'fixed in every conversation that has it, the person card is updated and future transcripts use the new ' +
      'name; a label like "Speaker 2" is fixed in this conversation only.',
  })
  @ApiDataResponse(NameFixResult)
  @ApiErrors('NOT_FOUND', 'VALIDATION_ERROR')
  fixName(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FixNameDto) {
    return this.nameFix.fixInConversation(userId, id, dto.from, dto.to, { onlyHere: dto.onlyHere });
  }

  @Patch('conversations/:id/summary')
  @ApiOperation({ summary: 'Fix the summary text' })
  @ApiDataResponse(SummaryUpdated)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  updateSummary(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSummaryDto,
  ) {
    return this.memory.updateSummary(userId, id, dto.summary);
  }

  @Patch('conversations/:id/transcript/:seq')
  @ApiOperation({ summary: 'Fix one transcript line' })
  @ApiDataResponse(SegmentUpdated)
  @ApiErrors('NOT_FOUND')
  updateSegment(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('seq', ParseIntPipe) seq: number,
    @Body() dto: UpdateSegmentDto,
  ) {
    return this.memory.updateSegment(userId, id, seq, dto.text);
  }

  @Get('corrections')
  @ApiOperation({ summary: 'Names the friend remembers fixing', description: 'Applied to every new transcript.' })
  @ApiDataResponse(NameCorrection, { isArray: true })
  corrections(@CurrentUserId() userId: string) {
    return this.nameFix.corrections(userId);
  }

  @Delete('corrections')
  @ApiOperation({ summary: 'Stop applying a name fix to new transcripts' })
  @ApiDataResponse(NameCorrection, { isArray: true })
  removeCorrection(@CurrentUserId() userId: string, @Query() q: CorrectionQueryDto) {
    return this.nameFix.removeCorrection(userId, q.from);
  }
}

/** Privacy (§10): export everything. */
@ApiTags('me')
@UserAuth()
@Controller('me/export')
export class DataExportController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get()
  @ApiOperation({ summary: 'Data export status', description: '`ready` comes with a download link valid for 3 days.' })
  @ApiDataResponse(DataExportStatus)
  status(@CurrentUserId() userId: string) {
    return this.privacy.status(userId);
  }

  @Post()
  @HttpCode(200)
  @ThrottleByUser()
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Export my data',
    description:
      'Builds one JSON file with everything the friend remembers (no tokens or secrets). The link is emailed ' +
      '("Data export ready") and returned by GET /me/export once ready.',
  })
  @ApiDataResponse(DataExportStatus)
  @ApiErrors('CONFLICT')
  request(@CurrentUserId() userId: string) {
    return this.privacy.request(userId);
  }
}

/** Public: the emailed download link (a long random token, valid for 3 days). */
@ApiTags('me')
@Controller('exports')
export class DataExportDownloadController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get(':token')
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Download a data export' })
  @ApiProduces('application/json')
  @ApiOkResponse({
    description: 'The export file (no envelope), downloaded as an attachment.',
    schema: {
      type: 'object',
      additionalProperties: true,
      properties: {
        exportedAt: { type: 'string', format: 'date-time' },
        account: { type: 'object', additionalProperties: true },
        conversations: { type: 'array', items: { type: 'object', additionalProperties: true } },
      },
    },
  })
  @ApiErrors('NOT_FOUND')
  async download(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const file = await this.privacy.download(token);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.body);
  }
}
