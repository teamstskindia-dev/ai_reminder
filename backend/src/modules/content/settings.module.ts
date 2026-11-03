import { Global, Module } from '@nestjs/common';
import { ContentCacheService } from './content-cache.service';
import { SettingsService } from './settings.service';

@Global()
@Module({
  providers: [SettingsService, ContentCacheService],
  exports: [SettingsService, ContentCacheService],
})
export class SettingsModule {}
