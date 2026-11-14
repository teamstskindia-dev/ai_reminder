import { Injectable, MiddlewareConsumer, Module, NestModule, OnApplicationBootstrap } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { RequestContextMiddleware } from './common/context/request-context.middleware';
import { THROTTLE_BY_USER } from './common/decorators/metadata.decorators';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { MaintenanceGuard } from './common/guards/maintenance.guard';
import type { AppRequest } from './common/http/request.types';
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { CoreModule } from './core.module';
import { REDIS } from './infra/redis/redis.constants';
import { StorageService } from './infra/storage/storage.service';
import { ActionItemsController } from './modules/action-items/action-items.controller';
import { ActionItemsModule } from './modules/action-items/action-items.module';
import { AdminAuthController } from './modules/admin/admin-auth.controller';
import { AdminBotController } from './modules/admin/admin-bot.controller';
import { AdminContentController } from './modules/admin/admin-content.controller';
import { AdminSystemController } from './modules/admin/admin-system.controller';
import { AdminUsersController } from './modules/admin/admin-users.controller';
import { AdminModule } from './modules/admin/admin.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsController, AnalyticsService } from './modules/analytics/analytics.controller';
import { AssistantController } from './modules/assistant/assistant.controller';
import { AssistantService } from './modules/assistant/assistant.service';
import { AuthController } from './modules/auth/auth.controller';
import { AuthGuard } from './modules/auth/auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { BotSchedulingModule } from './modules/bot/bot-scheduling.module';
import { RecallWebhookController } from './modules/bot/recall/recall-webhook.controller';
import { CalendarModule } from './modules/calendar/calendar.module';
import { ContentModule } from './modules/content/content.module';
import { DashboardController, DashboardService } from './modules/dashboard/dashboard.controller';
import { DevicesController } from './modules/devices/devices.controller';
import { HealthController } from './modules/health/health.controller';
import { IntegrationsController } from './modules/integrations/integrations.controller';
import { MeetingsController } from './modules/meetings/meetings.controller';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { NotificationsController } from './modules/notifications/notifications.controller';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OnboardingController, ProfileController } from './modules/onboarding/onboarding.controller';
import { OnboardingService } from './modules/onboarding/onboarding.service';
import { RealtimeGateway } from './modules/notifications/realtime.gateway';
import { PublicController } from './modules/public/public.controller';
import { RemindersController } from './modules/reminders/reminders.controller';
import { RemindersModule } from './modules/reminders/reminders.module';
import { MeController } from './modules/users/me.controller';
import { UsersModule } from './modules/users/users.module';

/** Ensures the private recordings bucket exists (API boot only; never blocks startup). */
@Injectable()
class StorageBootstrap implements OnApplicationBootstrap {
  constructor(private readonly storage: StorageService) {}
  onApplicationBootstrap(): void {
    void this.storage.ensureBucket();
  }
}

/** HTTP API + Socket.IO. Registers queues as producers only (no processors). */
@Module({
  imports: [
    CoreModule,
    TerminusModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        storage: new RedisThrottlerStorage(redis),
        // Per-user buckets for @ThrottleByUser routes (auth guard runs first), per-IP otherwise.
        getTracker: (req, context) => {
          const byUser =
            (Reflect.getMetadata(THROTTLE_BY_USER, context.getHandler()) as boolean | undefined) ||
            (Reflect.getMetadata(THROTTLE_BY_USER, context.getClass()) as boolean | undefined);
          const user = (req as AppRequest).user;
          return byUser && user ? `user:${user.id}` : ((req as AppRequest).ip ?? 'unknown');
        },
      }),
    }),
    AuthModule,
    UsersModule,
    MeetingsModule,
    BotSchedulingModule,
    RemindersModule,
    ActionItemsModule,
    NotificationsModule,
    CalendarModule,
    AiModule,
    ContentModule,
    AdminModule,
  ],
  controllers: [
    HealthController,
    PublicController,
    AuthController,
    MeController,
    ProfileController,
    OnboardingController,
    IntegrationsController,
    DashboardController,
    AnalyticsController,
    MeetingsController,
    ActionItemsController,
    RemindersController,
    NotificationsController,
    DevicesController,
    AssistantController,
    RecallWebhookController,
    AdminAuthController,
    AdminUsersController,
    AdminContentController,
    AdminSystemController,
    AdminBotController,
  ],
  providers: [
    DashboardService,
    AnalyticsService,
    AssistantService,
    OnboardingService,
    RealtimeGateway,
    StorageBootstrap,
    // Global guards run in this order: maintenance → auth → rate limit.
    { provide: APP_GUARD, useClass: MaintenanceGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class ApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
