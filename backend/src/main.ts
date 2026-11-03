import { loadDotEnv } from './config/load-env';
loadDotEnv();

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ApiModule } from './api.module';
import { getAppConfig } from './config/config.module';
import { expressErrorHandler } from './common/filters/all-exceptions.filter';
import { installProcessHandlers } from './common/lifecycle/process-lifecycle';
import { RedisIoAdapter } from './infra/realtime/redis-io.adapter';
import { COOKIES } from './modules/auth/auth-cookies.service';

async function bootstrap(): Promise<void> {
  const config = getAppConfig();
  const app = await NestFactory.create<NestExpressApplication>(ApiModule, { bufferLogs: true, bodyParser: false });
  const logger = app.get(Logger);
  app.useLogger(logger);
  // Signals are handled by installProcessHandlers → app.close() (runs every shutdown hook once).
  installProcessHandlers(app, logger, { name: 'api', shutdownTimeoutMs: 25_000 });

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(json({ limit: config.jsonBodyLimit }));
  app.use(urlencoded({ extended: false, limit: config.jsonBodyLimit }));
  app.use(expressErrorHandler);
  app.use(cookieParser());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'If-None-Match'],
    exposedHeaders: ['X-Request-Id', 'ETag', 'Retry-After'],
    maxAge: 600,
  });
  app.setGlobalPrefix('api/v1');

  const ioAdapter = new RedisIoAdapter(app, config.redisUrl, config.corsOrigins);
  ioAdapter.connect();
  app.useWebSocketAdapter(ioAdapter);

  if (config.swaggerEnabled) {
    const doc = new DocumentBuilder()
      .setTitle('Remi API')
      .setDescription(
        'Remi backend API (contract: docs/API_CONTRACT.md). All responses use the { success, data } envelope.',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'admin-bearer')
      .addCookieAuth(COOKIES.userAccess, { type: 'apiKey', in: 'cookie', name: COOKIES.userAccess }, COOKIES.userAccess)
      .addCookieAuth(
        COOKIES.adminAccess,
        { type: 'apiKey', in: 'cookie', name: COOKIES.adminAccess },
        COOKIES.adminAccess,
      )
      .build();
    SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, doc), {
      swaggerOptions: { persistAuthorization: false },
    });
  }

  await app.listen(config.port, '0.0.0.0');
  logger.log(
    `API listening on :${config.port} (swagger ${config.swaggerEnabled ? 'on /docs' : 'disabled'})`,
    'Bootstrap',
  );
}

bootstrap().catch((err: unknown) => {
  // Logger may not exist yet (e.g. invalid env): print a readable error and fail.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
