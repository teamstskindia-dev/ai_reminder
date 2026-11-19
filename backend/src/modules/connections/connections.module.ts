import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { ConnectionsService } from './connections.service';

/** Connected apps: OAuth, encrypted tokens and the reconnect state (shared by api and worker). */
@Module({
  imports: [UsersModule, NotificationsModule],
  providers: [ConnectionsService],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
