import {
  Controller,
  Get,
  Global,
  Header,
  Module,
  VERSION_NEUTRAL,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { CorrelationMiddleware } from './correlation.middleware';
import { HealthService } from './health.service';
import { MetricsService } from './metrics';

// Health + metrics live outside the /api prefix and outside URI versioning.
@ApiExcludeController()
@Controller({ version: VERSION_NEUTRAL })
class OpsController {
  constructor(
    private readonly health: HealthService,
    private readonly metrics: MetricsService,
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

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  async metricsEndpoint() {
    return this.metrics.render();
  }
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
