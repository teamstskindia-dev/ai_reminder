import { Module } from '@nestjs/common';
import { ActionItemsModule } from '../action-items/action-items.module';
import { ConnectionsModule } from '../connections/connections.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ToolTasksService } from './tool-tasks.service';

/** Notion, Jira and other tools (user-flow §08), shared by the api and the worker. */
@Module({
  imports: [ActionItemsModule, ConnectionsModule, NotificationsModule],
  providers: [ToolTasksService],
  exports: [ToolTasksService],
})
export class ToolsModule {}
