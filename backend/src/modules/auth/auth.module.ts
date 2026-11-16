import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../../config/app-config';
import { UsersModule } from '../users/users.module';
import { AdminsRepository } from './admins.repository';
import { AuthCookiesService } from './auth-cookies.service';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { AppleAuthService } from './apple-auth.service';
import { EmailAuthService } from './email-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { RefreshSessionService } from './refresh-session.service';
import { TokenService } from './token.service';

@Module({
  imports: [JwtModule.register({}), UsersModule],
  providers: [
    TokenService,
    AuthSessionsRepository,
    AdminsRepository,
    AuthCookiesService,
    AuthGuard,
    GoogleAuthService,
    EmailAuthService,
    AppleAuthService,
    AuthService,
    {
      provide: RefreshSessionService,
      inject: [AuthSessionsRepository, AppConfig],
      useFactory: (repo: AuthSessionsRepository, config: AppConfig) =>
        new RefreshSessionService(repo, config.jwt.refreshTtlDays),
    },
  ],
  exports: [
    TokenService,
    AuthSessionsRepository,
    AdminsRepository,
    AuthCookiesService,
    AuthGuard,
    RefreshSessionService,
    AuthService,
    GoogleAuthService,
    EmailAuthService,
  ],
})
export class AuthModule {}
