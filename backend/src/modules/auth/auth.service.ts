import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import type { ClientContext } from '../../common/http/request.types';
import type { AuthTokens, User, UserSettings } from '../../common/types/api.types';
import { toUser, toUserSettings } from '../users/users.mapper';
import { UsersRepository } from '../users/users.repository';
import { GoogleAuthService } from './google-auth.service';
import { RefreshSessionService } from './refresh-session.service';
import { TokenService } from './token.service';

/** End-user session lifecycle: one-time-code exchange, refresh rotation, logout. */
@Injectable()
export class AuthService {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: RefreshSessionService,
    private readonly googleAuth: GoogleAuthService,
    private readonly users: UsersRepository,
  ) {}

  async exchange(
    code: string,
    codeVerifier: string | undefined,
    ctx: ClientContext,
  ): Promise<{ user: User; tokens: AuthTokens; isNewUser: boolean; platform: 'web' | 'mobile' }> {
    const { userId, isNewUser, platform } = await this.googleAuth.consumeCode(code, codeVerifier, ctx);
    const row = await this.users.findById(userId);
    if (!row) throw AppException.unauthorized('Account no longer exists');
    if (row.status === 'suspended') throw AppException.forbidden('Your account is suspended');
    const tokens = await this.issue(userId, ctx);
    return { user: toUser(row), tokens, isNewUser, platform };
  }

  async refresh(refreshToken: string | undefined, ctx: ClientContext): Promise<AuthTokens> {
    if (!refreshToken) throw AppException.unauthorized('Refresh token missing');
    const rotated = await this.sessions.rotate(refreshToken, 'user', ctx);
    const user = await this.users.findById(rotated.subjectId);
    if (!user || user.status !== 'active') {
      await this.sessions.revokeAll('user', rotated.subjectId);
      throw AppException.unauthorized('Account is not active');
    }
    return {
      accessToken: await this.tokens.signUser(rotated.subjectId),
      refreshToken: rotated.token,
      expiresIn: this.tokens.accessTtlSeconds,
    };
  }

  logout(refreshToken: string | undefined): Promise<void> {
    return this.sessions.revoke(refreshToken, 'user');
  }

  async me(userId: string): Promise<{ user: User; settings: UserSettings }> {
    const [row, settings] = await Promise.all([this.users.getById(userId), this.users.getSettings(userId)]);
    return { user: toUser(row), settings: toUserSettings(settings) };
  }

  private async issue(userId: string, ctx: ClientContext): Promise<AuthTokens> {
    const [accessToken, refresh] = await Promise.all([
      this.tokens.signUser(userId),
      this.sessions.issue('user', userId, ctx),
    ]);
    return { accessToken, refreshToken: refresh.token, expiresIn: this.tokens.accessTtlSeconds };
  }
}
