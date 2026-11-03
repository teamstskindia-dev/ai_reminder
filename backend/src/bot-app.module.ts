import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { BotRunnerModule } from './modules/bot/runner/bot-runner.module';

/** Bot process: only the `meeting-bot` processor (Chromium + Meet runner). */
@Module({
  imports: [CoreModule, BotRunnerModule],
})
export class BotAppModule {}
