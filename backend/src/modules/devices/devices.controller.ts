import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, Length, Matches } from 'class-validator';
import { AppException } from '../../common/errors/app.exception';
import { IsOptionalNullable } from '../../common/validation/validators';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { DevicesRepository, toDevice } from './devices.repository';

const EXPO_TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;

export class RegisterDeviceDto {
  @Matches(EXPO_TOKEN_RE, { message: 'expoPushToken must be an Expo push token' })
  expoPushToken: string;

  @IsIn(['android', 'ios'])
  platform: 'android' | 'ios';

  @IsOptionalNullable()
  @IsString()
  @Length(1, 120)
  deviceName?: string | null;

  @IsOptionalNullable()
  @Matches(/^[0-9A-Za-z.+-]{1,32}$/, { message: 'appVersion must be a version string' })
  appVersion?: string | null;
}

@ApiTags('devices')
@UserAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesRepository) {}

  @Get()
  async list(@CurrentUserId() userId: string) {
    return (await this.devices.listForUser(userId)).map(toDevice);
  }

  @Post()
  async register(@CurrentUserId() userId: string, @Body() dto: RegisterDeviceDto) {
    return toDevice(
      await this.devices.upsert(userId, {
        expoPushToken: dto.expoPushToken,
        platform: dto.platform,
        deviceName: dto.deviceName ?? null,
        appVersion: dto.appVersion ?? null,
      }),
    );
  }

  @Delete(':expoPushToken')
  @HttpCode(204)
  async remove(@CurrentUserId() userId: string, @Param('expoPushToken') token: string): Promise<void> {
    if (!EXPO_TOKEN_RE.test(token)) throw AppException.badRequest('Invalid push token');
    const removed = await this.devices.deleteForUser(userId, token);
    if (!removed) throw AppException.notFound('Device');
  }
}
