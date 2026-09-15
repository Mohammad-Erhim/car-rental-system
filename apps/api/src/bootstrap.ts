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
    // preserves the raw request body alongside normal JSON parsing (req.rawBody) — the Stripe
    // webhook endpoint needs the exact original bytes to verify a signature; re-serializing the
    // parsed JSON would silently break verification on the smallest formatting difference.
    rawBody: true,
  });

  app.useLogger(app.get(Logger));
  app.flushLogs();

  // Brand-asset uploads (DEC-025) send an image as base64 JSON; the 100 KB default is too small.
  // 3 MB covers a 2 MB OG image (~2.7 MB encoded); every upload route is staff-only + rate-limited.
  app.useBodyParser('json', { limit: '3mb' });

  app.set('trust proxy', 1);
  app.use(
    helmet({
      // Explicit `true`/`false` rather than `undefined` — helmet treats an explicit `undefined`
      // identically to `true` (applies its own default CSP; verified against helmet 7.1.0's
      // source), so behaviour is unchanged, but that merge rule is easy to get wrong reading this
      // call site in isolation. In production this is helmet's default directive set (self-only,
      // no inline/eval) — safe for this app's JSON API surface; Swagger UI (which would need
      // relaxing that) is not mounted in production at all, see below.
      contentSecurityPolicy: env.NODE_ENV === 'production' ? true : false,
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
  // Always build the document — `pnpm openapi:generate` / `--check` (verify:static) reuse this
  // exact object via the exported `openapiDocument`, and NODE_ENV there is dev/CI, never
  // production, so this never runs in a real prod boot. `createDocument` only builds metadata; it
  // doesn't mount any route, so building it is free of the exposure below.
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  openapiDocument = document;

  // The interactive UI + JSON spec at a public URL is a deliberate call, not a given — full
  // schema/route documentation in production is more than this app needs to disclose by default.
  // Gated off there (the safer default); flip this if that's a conscious product decision instead.
  if (env.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/v1/docs', app, document, {
      jsonDocumentUrl: 'api/v1/openapi.json',
      swaggerOptions: { persistAuthorization: true },
    });
  }

  return app;
}

/** The generated OpenAPI document, available after createApp() runs. */
export let openapiDocument: unknown = null;

export async function closeApp(app: INestApplication): Promise<void> {
  await app.close();
}
