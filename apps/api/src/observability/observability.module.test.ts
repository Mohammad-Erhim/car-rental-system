import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import type { Env } from '../config/env.schema';

import type { HealthService } from './health.service';
import type { MetricsService } from './metrics';
import { OpsController } from './observability.module';

function fakeReq(headers: Record<string, string> = {}): Request {
  return { header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

const metrics = { render: async () => '# HELP fake\nfake_metric 1\n' } as unknown as MetricsService;
const health = {} as unknown as HealthService;

describe('OpsController /metrics', () => {
  it('is open when no METRICS_TOKEN is configured (fresh local checkout, unchanged behaviour)', async () => {
    const controller = new OpsController(health, metrics, { METRICS_TOKEN: undefined } as Env);
    await expect(controller.metricsEndpoint(fakeReq())).resolves.toContain('fake_metric');
  });

  it('rejects a request with no token once METRICS_TOKEN is configured', async () => {
    const controller = new OpsController(health, metrics, { METRICS_TOKEN: 'secret-1' } as Env);
    await expect(controller.metricsEndpoint(fakeReq())).rejects.toThrow();
  });

  it('rejects a request with the wrong token', async () => {
    const controller = new OpsController(health, metrics, { METRICS_TOKEN: 'secret-1' } as Env);
    await expect(
      controller.metricsEndpoint(fakeReq({ 'x-metrics-token': 'wrong' })),
    ).rejects.toThrow();
  });

  it('accepts a request with the matching token', async () => {
    const controller = new OpsController(health, metrics, { METRICS_TOKEN: 'secret-1' } as Env);
    await expect(
      controller.metricsEndpoint(fakeReq({ 'x-metrics-token': 'secret-1' })),
    ).resolves.toContain('fake_metric');
  });
});
