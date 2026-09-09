import { zBuildInfo, zHealthSummary, zLocalesResponse } from '@carrental/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';

/**
 * TEST-API-META-001..004 (STAGE-000). Proves the meta operations: success + shape,
 * 404-no-leak, and DB-backed locale rows.
 */
describe('meta API', () => {
  let server: ReturnType<typeof httpServer>;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
  });
  afterAll(closeTestApp);

  it('GET /api/v1/meta/locales returns DB-backed locales matching the schema', async () => {
    const res = await request(server).get('/api/v1/meta/locales').expect(200);
    const parsed = zLocalesResponse.parse(res.body);
    expect(parsed.defaultLocale).toBe('en');
    const codes = parsed.locales.map((l) => l.code).sort();
    expect(codes).toEqual(['ar', 'en', 'fr']);
    expect(parsed.locales.find((l) => l.code === 'ar')?.direction).toBe('rtl');
    expect(parsed.locales.every((l) => !l.testOnly)).toBe(true); // DEC-024 launch locales
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });

  it('GET /api/v1/meta/build returns safe metadata (no secrets)', async () => {
    const res = await request(server).get('/api/v1/meta/build').expect(200);
    const parsed = zBuildInfo.parse(res.body);
    expect(parsed.name).toBe('carrental-api');
    expect(JSON.stringify(parsed)).not.toMatch(/secret|password|pepper|DATABASE_URL/i);
  });

  it('GET /api/v1/meta/health-summary reports ok with component checks', async () => {
    const res = await request(server).get('/api/v1/meta/health-summary').expect(200);
    const parsed = zHealthSummary.parse(res.body);
    expect(['ok', 'degraded', 'down']).toContain(parsed.status);
    const names = parsed.components.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['db', 'redis', 'migrations', 'lookups']));
    expect(parsed.status).toBe('ok');
  });

  it('unknown route returns a Problem envelope with a stable code and no stack/leak', async () => {
    const res = await request(server).get('/api/v1/meta/does-not-exist').expect(404);
    expect(res.body).toMatchObject({
      code: expect.any(String),
      category: expect.any(String),
      status: 404,
      correlationId: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/ at .*\.ts:\d+|node_modules|select \* from/i);
  });

  it('health endpoints are served outside the /api prefix', async () => {
    await request(server).get('/health/live').expect(200);
    const ready = await request(server).get('/health/ready').expect(200);
    expect(ready.body.status).toBe('ok');
    expect(ready.body.checks.db.status).toBe('ok');
    expect(ready.body.checks.lookups.status).toBe('ok');
  });

  it('/metrics exposes Prometheus text with http + default metrics', async () => {
    await request(server).get('/api/v1/meta/build'); // generate a data point
    const res = await request(server).get('/metrics').expect(200);
    expect(res.text).toMatch(/# HELP http_requests_total/);
    expect(res.text).toMatch(/process_cpu_user_seconds_total|nodejs_eventloop_lag_seconds/);
  });

  it('GET /api/v1/meta/branding.css serves the brand tokens as a cacheable stylesheet', async () => {
    const res = await request(server).get('/api/v1/meta/branding.css').expect(200);
    expect(res.headers['content-type']).toContain('text/css');
    expect(res.headers['cache-control']).toContain('max-age');
    expect(res.headers.etag).toMatch(/^"brandcss-/);
    expect(res.text).toMatch(/:root\s*\{[\s\S]*--primary:/);
    expect(res.text).toMatch(/\.dark\s*\{/);
  });

  it('GET /api/v1/meta/icon.svg is an SVG favicon coloured from the brand', async () => {
    const res = await request(server)
      .get('/api/v1/meta/icon.svg')
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (c) => (data += c));
        r.on('end', () => cb(null, data));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    expect(res.headers.etag).toMatch(/^"icon-/);
    const svg = res.body as string;
    expect(svg).toMatch(/<svg[\s\S]*<\/svg>/);
    expect(svg).toMatch(/#[0-9a-fA-F]{6}/); // brand-derived gradient stops
  });
});
