import { Controller, Get, Headers, Param, Query, Res } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import type { Response } from 'express';
import { MaintenanceExempt } from '../../common/decorators/metadata.decorators';
import { AppException } from '../../common/errors/app.exception';
import { PublicContentService } from '../content/public-content.service';

export class PlatformQueryDto {
  @ApiPropertyOptional({ enum: ['web', 'mobile'], default: 'web' })
  @IsOptional()
  @IsIn(['web', 'mobile'])
  platform: 'web' | 'mobile' = 'web';
}

export class SectionsQueryDto extends PlatformQueryDto {
  @ApiPropertyOptional({ default: 'landing' })
  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]{0,40}$/, { message: 'page must be a page key like "landing"' })
  page: string = 'landing';
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@ApiTags('public')
@MaintenanceExempt()
@Controller('public')
export class PublicController {
  constructor(private readonly content: PublicContentService) {}

  @Get('config')
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
  sections(@Query() q: SectionsQueryDto) {
    return this.content.sections(q.page, q.platform);
  }

  @Get('pages/:slug')
  page(@Param('slug') slug: string) {
    if (slug.length > 100 || !SLUG_RE.test(slug)) throw AppException.notFound('Page');
    return this.content.page(slug);
  }

  @Get('plans')
  plans() {
    return this.content.plans();
  }
}
