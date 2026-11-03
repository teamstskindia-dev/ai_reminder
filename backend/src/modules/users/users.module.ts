import { Module } from '@nestjs/common';
import { AuthSessionsRepository } from '../auth/auth-sessions.repository';
import { AccountDeletionService } from './account-deletion.service';
import { GoogleAccountsRepository, UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  providers: [UsersRepository, GoogleAccountsRepository, UsersService, AccountDeletionService, AuthSessionsRepository],
  exports: [UsersRepository, GoogleAccountsRepository, UsersService, AccountDeletionService],
})
export class UsersModule {}
