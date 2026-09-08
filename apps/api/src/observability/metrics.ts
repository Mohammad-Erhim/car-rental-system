import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus text-exposition metrics (SRS-OBS-006). Traffic, latency, errors, and per-domain
 * counters register here; more are added as modules land.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequests: Counter<string>;
  readonly httpDuration: Histogram<string>;
  readonly domainCommands: Counter<string>;
  readonly providerAttempts: Counter<string>;
  readonly outboxBacklog: Gauge<string>;

  constructor() {
    this.registry.setDefaultLabels({ service: 'carrental-api' });
    collectDefaultMetrics({ register: this.registry });

    this.httpRequests = new Counter({
      name: 'http_requests_total',
      help: 'HTTP requests by route template, method, status class',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration by route template',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.domainCommands = new Counter({
      name: 'domain_commands_total',
      help: 'Domain command executions by name and outcome',
      labelNames: ['command', 'outcome'],
      registers: [this.registry],
    });

    this.providerAttempts = new Counter({
      name: 'provider_attempts_total',
      help: 'External/simulated provider attempts by provider and outcome',
      labelNames: ['provider', 'outcome'],
      registers: [this.registry],
    });

    // SRS-OBS-006 — undelivered transactional-outbox rows. Refreshed by HealthService on every
    // readiness probe (the operational signal per SRS §"workers periodically inspect … outbox
    // messages not delivered").
    this.outboxBacklog = new Gauge({
      name: 'outbox_backlog',
      help: 'Transactional outbox rows not yet delivered',
      registers: [this.registry],
    });
  }

  setOutboxBacklog(n: number): void {
    this.outboxBacklog.set(n);
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
