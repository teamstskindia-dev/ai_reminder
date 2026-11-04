import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AppException } from '../../common/errors/app.exception';
import { ApiDataResponse, ApiErrors } from '../../common/swagger/api-docs.decorators';
import { CurrentUserId, UserAuth } from '../auth/auth.decorators';
import { Device, EXPO_TOKEN_RE, RegisterDeviceDto } from './devices.dto';
import { DevicesRepository, toDevice } from './devices.repository';

@ApiTags('devices')
@UserAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesRepository) {}

  @Get()
  @ApiOperation({ summary: 'List devices registered for push notifications' })
  @ApiDataResponse(Device, { isArray: true })
  async list(@CurrentUserId() userId: string) {
    return (await this.devices.listForUser(userId)).map(toDevice);
  }

  @Post()
  @ApiOperation({
    summary: 'Register (or refresh) this device for push notifications',
    description: 'Idempotent: registering the same Expo push token again updates it and moves it to this user.',
  })
  @ApiDataResponse(Device, { status: 201 })
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
  @ApiOperation({ summary: 'Unregister a device (call on sign-out)' })
  @ApiParam({ name: 'expoPushToken', schema: { type: 'string', pattern: EXPO_TOKEN_RE.source } })
  @ApiNoContentResponse({ description: 'Unregistered.' })
  @ApiErrors('BAD_REQUEST', 'NOT_FOUND')
  async remove(@CurrentUserId() userId: string, @Param('expoPushToken') token: string): Promise<void> {
    if (!EXPO_TOKEN_RE.test(token)) throw AppException.badRequest('Invalid push token');
    const removed = await this.devices.deleteForUser(userId, token);
    if (!removed) throw AppException.notFound('Device');
  }
}
