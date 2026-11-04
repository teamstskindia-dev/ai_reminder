import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ApiFoundResponse, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MaintenanceExempt } from '../../common/decorators/metadata.decorators';
import { clientContext } from '../../common/http/request.types';
import type { AppRequest } from '../../common/http/request.types';
import { ApiDataResponse, ApiErrors } from '../../common/swagger/api-docs.decorators';
import { MeResult, SignInResult, TokensResult } from '../users/dto/users.responses.dto';
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
  @ApiOperation({
    summary: 'Start Google sign-in',
    description:
      'Redirects to the Google consent screen. Mobile must pass `platform=mobile`, an allow-listed ' +
      '`redirectUri` and a PKCE `codeChallenge` (S256). Open this URL in a browser; it is not a JSON endpoint.',
  })
  @ApiFoundResponse({ description: 'Redirect to Google.' })
  @ApiErrors('BAD_REQUEST')
  async google(@Query() query: GoogleAuthQueryDto, @Res() res: Response): Promise<void> {
    const url = await this.googleAuth.consentUrl(query.platform, query.redirectUri, query.codeChallenge);
    res.redirect(302, url);
  }

  @Get('google/callback')
  @ApiOperation({
    summary: 'Google OAuth callback',
    description:
      'Called by Google with `code` and `state` (or `error`). Redirects to the website `/auth/callback` or the ' +
      'mobile `redirectUri` with a one-time `?code=` to pass to `POST /auth/exchange`, or with ' +
      '`?error=access_denied|oauth_failed|signups_disabled|account_suspended`. Failures are always redirects.',
  })
  @ApiFoundResponse({ description: 'Redirect to the website or the app with `?code=` or `?error=`.' })
  async googleCallback(@Query() query: Record<string, string | undefined>, @Res() res: Response): Promise<void> {
    res.redirect(302, await this.googleAuth.handleCallback(query));
  }

  @Post('exchange')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Exchange the one-time sign-in code for tokens',
    description:
      'The code is single use and short-lived. Mobile must send the PKCE `codeVerifier`. Web sign-ins also get ' +
      'the httpOnly auth cookies.',
  })
  @ApiDataResponse(SignInResult)
  @ApiErrors('UNAUTHORIZED', 'FORBIDDEN')
  async exchange(@Body() dto: ExchangeCodeDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { platform, ...result } = await this.auth.exchange(dto.code, dto.codeVerifier, clientContext(req));
    if (platform === 'web') this.cookies.set(res, 'user', result.tokens);
    return result;
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Rotate the refresh token',
    description:
      'Mobile sends `refreshToken` in the body; the website relies on the `remi_rt` cookie. The old refresh token ' +
      'stops working; reusing it revokes the whole session.',
  })
  @ApiDataResponse(TokensResult)
  @ApiErrors('UNAUTHORIZED')
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
  @ApiOperation({ summary: 'Sign out (revokes the refresh token and clears the auth cookies)' })
  @ApiNoContentResponse({ description: 'Signed out.' })
  async logout(@Body() dto: RefreshTokenDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(dto.refreshToken ?? this.cookies.readRefresh(req, 'user'));
    this.cookies.clear(res, 'user');
  }

  @Get('me')
  @UserAuth()
  @ApiOperation({ summary: 'Get the signed-in user and their settings' })
  @ApiDataResponse(MeResult)
  me(@CurrentUserId() userId: string) {
    return this.auth.me(userId);
  }
}
