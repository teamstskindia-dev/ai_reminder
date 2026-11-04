import { Controller, Get, Headers, Param, Query, Res } from '@nestjs/common';
import { ApiHeader, ApiNotModifiedResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MaintenanceExempt } from '../../common/decorators/metadata.decorators';
import { AppException } from '../../common/errors/app.exception';
import { ApiDataResponse, ApiErrors } from '../../common/swagger/api-docs.decorators';
import { PublicContentService } from '../content/public-content.service';
import { CmsPage, Plan, PublicConfig, Section } from '../content/content.responses.dto';
import { PlatformQueryDto, PublicSectionsQueryDto } from './public.dto';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@ApiTags('public')
@MaintenanceExempt()
@Controller('public')
export class PublicController {
  constructor(private readonly content: PublicContentService) {}

  @Get('config')
  @ApiOperation({
    summary: 'Get branding, theme, feature flags, navigation and banners',
    description:
      'Cache with the `ETag`: send it back as `If-None-Match` and the API answers `304` while nothing changed.',
  })
  @ApiHeader({ name: 'If-None-Match', required: false, description: 'ETag from a previous response.' })
  @ApiDataResponse(PublicConfig, { description: 'Current public config. The `ETag` header carries `version`.' })
  @ApiNotModifiedResponse({ description: 'The config has not changed since the given ETag.' })
  async config(
    @Query() q: PlatformQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const config = await this.content.config(q.platform);
    const etag = `"${config.version}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    const tags = (ifNoneMatch ?? '').split(',').map((t) => t.trim().replace(/^W\//, ''));
    if (tags.includes(etag)) {
      res.status(304);
      return undefined;
    }
    return config;
  }

  @Get('sections')
  @ApiOperation({ summary: 'List the active sections of a CMS page (landing page, onboarding slides)' })
  @ApiDataResponse(Section, { isArray: true })
  sections(@Query() q: PublicSectionsQueryDto) {
    return this.content.sections(q.page, q.platform);
  }

  @Get('pages/:slug')
  @ApiOperation({ summary: 'Get a published CMS page by slug' })
  @ApiParam({
    name: 'slug',
    example: 'privacy-policy',
    schema: { type: 'string', pattern: SLUG_RE.source, maxLength: 100 },
  })
  @ApiDataResponse(CmsPage)
  @ApiErrors('NOT_FOUND')
  page(@Param('slug') slug: string) {
    if (slug.length > 100 || !SLUG_RE.test(slug)) throw AppException.notFound('Page');
    return this.content.page(slug);
  }

  @Get('plans')
  @ApiOperation({ summary: 'List the active pricing plans' })
  @ApiDataResponse(Plan, { isArray: true })
  plans() {
    return this.content.plans();
  }
}
