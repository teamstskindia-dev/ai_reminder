import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { MediaService } from '../media/media.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { AdminAdminsService } from './admin-admins.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminContentService } from './admin-content.service';
import { AdminMiscService } from './admin-misc.service';
import { AdminUsersService } from './admin-users.service';
import { AuditInterceptor, AuditService } from './audit';
import { QueueAdminService } from './queue-admin.service';

@Module({
  imports: [AuthModule, UsersModule, MeetingsModule, AiModule, NotificationsModule],
  providers: [
    AdminAuthService,
    AdminUsersService,
    AdminContentService,
    AdminMiscService,
    AdminAdminsService,
    QueueAdminService,
    MediaService,
    AuditService,
    AuditInterceptor,
  ],
  exports: [
    AdminAuthService,
    AdminUsersService,
    AdminContentService,
    AdminMiscService,
    AdminAdminsService,
    QueueAdminService,
    MediaService,
    AuditService,
    AuditInterceptor,
  ],
})
export class AdminModule {}
