import { Global, Module } from '@nestjs/common';
import { AppConfig } from './app-config';

let instance: AppConfig | undefined;

/** Single parsed config per process (fails fast with a readable error). */
export function getAppConfig(): AppConfig {
  instance ??= new AppConfig(process.env);
  return instance;
}

@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: getAppConfig }],
  exports: [AppConfig],
})
export class AppConfigModule {}
