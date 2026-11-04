import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';

export class PlatformQueryDto {
  @ApiPropertyOptional({ enum: ['web', 'mobile'], default: 'web' })
  @IsOptional()
  @IsIn(['web', 'mobile'])
  platform: 'web' | 'mobile' = 'web';
}

export class PublicSectionsQueryDto extends PlatformQueryDto {
  /** Page key whose sections to return. */
  @ApiPropertyOptional({ default: 'landing', example: 'landing' })
  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]{0,40}$/, { message: 'page must be a page key like "landing"' })
  page: string = 'landing';
}
