import 'reflect-metadata';

import { VersioningType, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { patchNestJsSwagger, ZodValidationPipe } from 'nestjs-zod';

import { AppModule } from './app.module';
import { GlobalErrorFilter } from './common/error.filter';
import { loadEnv } from './config/env.schema';
import { MetricsService } from './observability/metrics';
import { MetricsInterceptor } from './observability/metrics.interceptor';

patchNestJsSwagger();

export async function createApp(): Promise<NestExpressApplication> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    cors: false,
  });

  app.useLogger(app.get(Logger));
  app.flushLogs();

  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(cookieParser(env.COOKIE_SECRET));

  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS,
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'If-Match',
      'X-CSRF-Token',
      'X-Request-Id',
      'Accept-Language',
    ],
    exposedHeaders: ['x-correlation-id', 'ETag'],
  });

  app.setGlobalPrefix('api', {
    exclude: ['health/live', 'health/ready', 'health/version', 'metrics'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Zod-based validation (no class-validator). DTOs built with `createZodDto` validate here;
  // controllers may also use the explicit ZodValidationPipe from ./common for query/param parts.
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new GlobalErrorFilter());
  app.useGlobalInterceptors(new MetricsInterceptor(app.get(MetricsService)));

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Car Rental System API')
    .setDescription(
      'Versioned REST boundary consumed by Customer Web, Operations Dashboard, workers, and the ' +
        'mobile app. All business options are served dynamically; money is integer minor units.',
    )
    .setVersion('1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addCookieAuth('refresh_token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/v1/docs', app, document, {
    jsonDocumentUrl: 'api/v1/openapi.json',
    swaggerOptions: { persistAuthorization: true },
  });
  openapiDocument = document;

  return app;
}

/** The generated OpenAPI document, available after createApp() runs. */
export let openapiDocument: unknown = null;

export async function closeApp(app: INestApplication): Promise<void> {
  await app.close();
}
