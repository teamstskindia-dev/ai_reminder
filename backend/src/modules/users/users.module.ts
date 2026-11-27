import { Module } from '@nestjs/common';
import { AuthSessionsRepository } from '../auth/auth-sessions.repository';
import { UserAccessBlocklist } from '../auth/user-access-blocklist';
import { AccountDeletionService } from './account-deletion.service';
import { UploadQuotaService } from './upload-quota.service';
import { GoogleAccountsRepository, UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  providers: [
    UsersRepository,
    GoogleAccountsRepository,
    UsersService,
    AccountDeletionService,
    AuthSessionsRepository,
    UserAccessBlocklist,
    UploadQuotaService,
  ],
  exports: [
    UsersRepository,
    GoogleAccountsRepository,
    UsersService,
    AccountDeletionService,
    UserAccessBlocklist,
    UploadQuotaService,
  ],
})
export class UsersModule {}
