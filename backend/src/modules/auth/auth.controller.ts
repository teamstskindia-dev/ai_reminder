import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MaintenanceExempt } from '../../common/decorators/metadata.decorators';
import { clientContext } from '../../common/http/request.types';
import type { AppRequest } from '../../common/http/request.types';
import { AuthCookiesService } from './auth-cookies.service';
import { CurrentUserId, UserAuth } from './auth.decorators';
import { AuthService } from './auth.service';
import { ExchangeCodeDto, GoogleAuthQueryDto, RefreshTokenDto } from './dto/auth.dto';
import { GoogleAuthService } from './google-auth.service';

@ApiTags('auth')
@MaintenanceExempt()
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly googleAuth: GoogleAuthService,
    private readonly cookies: AuthCookiesService,
  ) {}

  @Get('google')
  @ApiOperation({ summary: 'Start Google sign-in (302 to Google consent)' })
  async google(@Query() query: GoogleAuthQueryDto, @Res() res: Response): Promise<void> {
    const url = await this.googleAuth.consentUrl(query.platform, query.redirectUri, query.codeChallenge);
    res.redirect(302, url);
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth callback (302 to web/mobile with ?code= or ?error=)' })
  async googleCallback(@Query() query: Record<string, string | undefined>, @Res() res: Response): Promise<void> {
    res.redirect(302, await this.googleAuth.handleCallback(query));
  }

  @Post('exchange')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange the one-time code for tokens (also sets web cookies)' })
  async exchange(@Body() dto: ExchangeCodeDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { platform, ...result } = await this.auth.exchange(dto.code, dto.codeVerifier, clientContext(req));
    if (platform === 'web') this.cookies.set(res, 'user', result.tokens);
    return result;
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the refresh token (body for mobile, remi_rt cookie for web)' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const token = dto.refreshToken ?? this.cookies.readRefresh(req, 'user');
    try {
      const tokens = await this.auth.refresh(token, clientContext(req));
      this.cookies.set(res, 'user', tokens);
      return { tokens };
    } catch (err) {
      this.cookies.clear(res, 'user');
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshTokenDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(dto.refreshToken ?? this.cookies.readRefresh(req, 'user'));
    this.cookies.clear(res, 'user');
  }

  @Get('me')
  @UserAuth()
  me(@CurrentUserId() userId: string) {
    return this.auth.me(userId);
  }
}
