import { Module } from '@nestjs/common';
import { DevicesRepository } from '../devices/devices.repository';
import { UsersModule } from '../users/users.module';
import { DeliveryService } from './delivery.service';
import { NotificationProducer } from './notification-producer.service';
import { NotificationsRepository, TemplatesRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [UsersModule],
  providers: [
    NotificationsRepository,
    TemplatesRepository,
    DevicesRepository,
    DeliveryService,
    NotificationsService,
    NotificationProducer,
  ],
  exports: [
    NotificationsRepository,
    TemplatesRepository,
    DevicesRepository,
    DeliveryService,
    NotificationsService,
    NotificationProducer,
  ],
})
export class NotificationsModule {}
