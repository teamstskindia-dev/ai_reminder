import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MaintenanceExempt } from '../../common/decorators/metadata.decorators';
import { clientContext } from '../../common/http/request.types';
import type { AppRequest } from '../../common/http/request.types';
import type { AdminRow } from '../../infra/prisma/models';
import { AuthCookiesService } from '../auth/auth-cookies.service';
import { AdminAuth, CurrentAdmin } from '../auth/auth.decorators';
import { AdminAuthService, toAdminUser } from './admin-auth.service';
import { Audited, AuditInterceptor } from './audit';
import { AdminLoginDto, AdminRefreshDto, UpdateAdminMeDto } from './dto/admin.dto';

@ApiTags('admin: auth')
@MaintenanceExempt()
@UseInterceptors(AuditInterceptor)
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly cookies: AuthCookiesService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: AdminLoginDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password, clientContext(req));
    this.cookies.set(res, 'admin', result.tokens);
    return result;
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async refresh(@Body() dto: AdminRefreshDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    try {
      const tokens = await this.auth.refresh(
        dto.refreshToken ?? this.cookies.readRefresh(req, 'admin'),
        clientContext(req),
      );
      this.cookies.set(res, 'admin', tokens);
      return { tokens };
    } catch (err) {
      this.cookies.clear(res, 'admin');
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @AdminAuth()
  async logout(@Body() dto: AdminRefreshDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(dto.refreshToken ?? this.cookies.readRefresh(req, 'admin'));
    this.cookies.clear(res, 'admin');
  }

  @Get('me')
  @AdminAuth()
  me(@CurrentAdmin() admin: AdminRow) {
    return toAdminUser(admin);
  }

  @Patch('me')
  @AdminAuth()
  @Audited('admin.update_self', 'admins')
  updateMe(@CurrentAdmin() admin: AdminRow, @Body() dto: UpdateAdminMeDto) {
    return this.auth.updateMe(admin, dto);
  }
}
