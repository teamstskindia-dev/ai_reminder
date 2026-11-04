import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, Length, Matches } from 'class-validator';
import { ApiDateTime, ApiUuid } from '../../common/swagger/api-docs.decorators';
import type * as Contract from '../../common/types/api.types';
import { IsOptionalNullable } from '../../common/validation/validators';

export const EXPO_TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;
const APP_VERSION_RE = /^[0-9A-Za-z.+-]{1,32}$/;

export class RegisterDeviceDto {
  @ApiProperty({ pattern: EXPO_TOKEN_RE.source, example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @Matches(EXPO_TOKEN_RE, { message: 'expoPushToken must be an Expo push token' })
  expoPushToken: string;

  @IsIn(['android', 'ios'])
  platform: 'android' | 'ios';

  @ApiPropertyOptional({ example: 'Pixel 9' })
  @IsOptionalNullable()
  @IsString()
  @Length(1, 120)
  deviceName?: string | null;

  @ApiPropertyOptional({ pattern: APP_VERSION_RE.source, example: '1.4.0' })
  @IsOptionalNullable()
  @Matches(APP_VERSION_RE, { message: 'appVersion must be a version string' })
  appVersion?: string | null;
}

// ---------- responses ----------

export class Device implements Contract.Device {
  @ApiUuid() id: string;
  platform: 'android' | 'ios' | 'web';
  deviceName: string | null;
  appVersion: string | null;
  @ApiDateTime() lastSeenAt: string;
}
