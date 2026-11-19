import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { IsOptionalNonNull, IsOptionalNullable } from '../../common/validation/validators';

export class ConnectQueryDto {
  /** Where to send the user back after consent: the app's deep link (`remi://integrations/callback`). */
  @ApiProperty({ maxLength: 512, example: 'remi://integrations/callback' })
  @IsString()
  @Length(1, 512)
  redirectUri: string;

  /** Email only: `read` (read the inbox) or `send` (also send replies you approve). Default `send`. */
  @ApiPropertyOptional({ enum: ['read', 'send'] })
  @IsOptional()
  @IsIn(['read', 'send'])
  mode?: 'read' | 'send';
}

export class UpdateIntegrationDto {
  /** Tools: default Notion database / Jira project / Linear team / Todoist project for new tasks. */
  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  @IsOptionalNullable()
  @IsString()
  @MaxLength(200)
  targetId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  @IsOptionalNullable()
  @IsString()
  @MaxLength(200)
  targetName?: string | null;

  /** Tools: create tasks without asking first. */
  @IsOptionalNonNull()
  @IsBoolean()
  autoSend?: boolean;
}
