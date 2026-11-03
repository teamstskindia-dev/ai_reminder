import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';
import { IsOptionalNonNull, IsOptionalNullable, IsTimeZone } from '../../../common/validation/validators';

export class UpdateMeDto {
  @IsOptionalNonNull()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptionalNonNull()
  @IsTimeZone()
  timezone?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptionalNonNull()
  @Matches(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, { message: 'locale must be a BCP-47 tag like "en" or "en-IN"' })
  locale?: string;

  @ApiPropertyOptional({ enum: [true] })
  @IsOptionalNonNull()
  @IsIn([true], { message: 'onboarded can only be set to true' })
  onboarded?: true;
}

export class UpdateUserSettingsDto {
  @ApiPropertyOptional({ enum: ['all', 'owned', 'none'] })
  @IsOptionalNonNull()
  @IsIn(['all', 'owned', 'none'])
  autoJoin?: 'all' | 'owned' | 'none';

  @ApiPropertyOptional({ nullable: true, description: 'null → global bot name' })
  @IsOptionalNullable()
  @IsString()
  @Length(1, 60)
  botName?: string | null;

  @IsOptionalNonNull()
  @IsInt()
  @Min(0)
  @Max(1440)
  meetingReminderMinutes?: number;

  @IsOptionalNonNull()
  @IsBoolean()
  dailyDigest?: boolean;

  @IsOptionalNonNull()
  @IsInt()
  @Min(0)
  @Max(23)
  digestHour?: number;

  @IsOptionalNonNull()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptionalNonNull()
  @IsBoolean()
  pushNotifications?: boolean;
}
