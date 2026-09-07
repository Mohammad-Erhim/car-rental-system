import { zBrandingResponse } from '@carrental/contracts';
import { DEFAULT_BRAND_CONFIG } from '@carrental/theme';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getTestApp, httpServer, closeTestApp } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * STAGE-009 — dashboard-managed theming & branding (DEC-025). The `branding` config-version
 * kind rides the existing draft → submit → approve workflow (separation of duties), validates
 * structure + WCAG AA, and is served publicly at `GET /api/v1/meta/branding`.
 */
describe('branding / theming config', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let managerToken: string;
  let agentToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    managerToken = (await signIn(app, 'test-manager@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
  });
  afterAll(closeTestApp);

  const draftBody = (payload: unknown) => ({ kind: 'branding', key: 'default', payload });

  it('GET /api/v1/meta/branding returns the built-in default with an ETag when nothing is published', async () => {
    const res = await request(server).get('/api/v1/meta/branding').expect(200);
    const parsed = zBrandingResponse.parse(res.body);
    expect(parsed.revision).toBe(0);
    expect(parsed.config.colors.light.primary).toBe(DEFAULT_BRAND_CONFIG.colors.light.primary);
    expect(res.headers.etag).toMatch(/^"brand-0-/);
    expect(res.headers['cache-control']).toContain('max-age');
  });

  it('draft → submit → a different reviewer approves → served publicly', async () => {
    const next = structuredClone(DEFAULT_BRAND_CONFIG);
    next.colors.light.primary = '160 84% 24%';
    next.colors.light.ring = '160 84% 28%';
    next.colors.dark.primary = '154 62% 58%';
    next.colors.dark.primaryForeground = '158 60% 9%';
    next.colors.dark.ring = '154 62% 58%';
    next.radius = 'lg';
    next.assets.wordmark = 'Acme Rentals';

    const drafted = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(draftBody(next))
      .expect(201);
    const id = drafted.body.id as string;
    expect(drafted.body.kind).toBe('branding');

    await request(server)
      .post(`/api/v1/ops/config/versions/${id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    // author cannot approve their own change (FR-ADM-006)
    const selfApprove = await request(server)
      .post(`/api/v1/ops/config/versions/${id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(403);
    expect(selfApprove.body.code).toBe('approval_required');

    const approved = await request(server)
      .post(`/api/v1/ops/config/versions/${id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    expect(approved.body.state).toBe('published');

    const pub = await request(server).get('/api/v1/meta/branding').expect(200);
    const parsed = zBrandingResponse.parse(pub.body);
    expect(parsed.revision).toBeGreaterThanOrEqual(1);
    expect(parsed.config.colors.light.primary).toBe('160 84% 24%');
    expect(parsed.config.radius).toBe('lg');
    expect(parsed.config.assets.wordmark).toBe('Acme Rentals');
    expect(pub.headers.etag).not.toMatch(/^"brand-0-/);
  });

  it('rejects a config whose foreground/background pair fails WCAG AA', async () => {
    const bad = structuredClone(DEFAULT_BRAND_CONFIG);
    bad.colors.light.primaryForeground = bad.colors.light.primary; // no contrast
    const res = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(draftBody(bad))
      .expect(422);
    expect(JSON.stringify(res.body)).toMatch(/contrast_below/);
  });

  it('rejects a non-https asset reference', async () => {
    const bad = structuredClone(DEFAULT_BRAND_CONFIG);
    bad.assets.logo = 'http://insecure.example/logo.png';
    const res = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(draftBody(bad))
      .expect(422);
    expect(JSON.stringify(res.body)).toMatch(/assets\.logo|must_be_https_url/);
  });

  it('preview reports AA cleanliness without publishing', async () => {
    const res = await request(server)
      .post('/api/v1/ops/config/versions/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'branding', payload: DEFAULT_BRAND_CONFIG })
      .expect(201);
    expect(res.body.aaClean).toBe(true);
    expect(String(res.body.examples[0])).toMatch(/clear WCAG AA/);
  });

  it('a rental agent (no config.publish) cannot draft branding', async () => {
    await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${agentToken}`)
      .send(draftBody(DEFAULT_BRAND_CONFIG))
      .expect(403);
  });
});
