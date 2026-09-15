import { timingSafeEqual } from 'node:crypto';

import {
  Controller,
  ForbiddenException,
  Get,
  Global,
  Header,
  Inject,
  Module,
  Req,
  VERSION_NEUTRAL,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';

import { Public } from '../common/auth/decorators';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';

import { CorrelationMiddleware } from './correlation.middleware';
import { HealthService } from './health.service';
import { MetricsService } from './metrics';

// Health + metrics live outside the /api prefix and outside URI versioning, and outside auth.
@ApiExcludeController()
@Public()
@Controller({ version: VERSION_NEUTRAL })
export class OpsController {
  constructor(
    private readonly health: HealthService,
    private readonly metrics: MetricsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Liveness — event loop responsive; no deep dependency call (SRS §16.3). */
  @Get('health/live')
  live() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  /** Readiness — dependencies + migration + lookup integrity checks (SRS §16.3, SRS-LKP-012). */
  @Get('health/ready')
  async ready() {
    const result = await this.health.readiness();
    return result;
  }

  /** Safe build/version/schema metadata; no secret/environment dump. */
  @Get('health/version')
  version() {
    return this.health.version();
  }

  // No staff/customer auth makes sense here — an external Prometheus scraper isn't an actor —
  // but left fully open it hands any unauthenticated caller Node process internals (memory, GC,
  // event-loop lag) and per-route request-rate/latency histograms. Gate on a shared secret
  // instead (METRICS_TOKEN): unset keeps a fresh local checkout working with zero setup; once an
  // operator sets it, every request must present the same value via `X-Metrics-Token`.
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  async metricsEndpoint(@Req() req: Request) {
    const token = this.env.METRICS_TOKEN;
    if (token) {
      const presented = req.header('x-metrics-token') ?? '';
      if (!timingSafeEqualStrings(presented, token)) {
        throw new ForbiddenException('metrics access denied');
      }
    }
    return this.metrics.render();
  }
}

/** Constant-time string comparison — a metrics token is a bearer secret like any other. */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

@Global()
@Module({
  controllers: [OpsController],
  providers: [MetricsService, HealthService, CorrelationMiddleware],
  exports: [MetricsService, HealthService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
