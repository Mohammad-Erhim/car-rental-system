import { DEFAULT_SEO_CONFIG, zSeoResponse } from '@carrental/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getTestApp, httpServer, closeTestApp } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * SRS-ADM-006 — dashboard-managed SEO config. The `seo` config-version kind rides the existing
 * draft → submit → approve workflow (separation of duties), validates structure + https URLs,
 * and is served publicly at `GET /api/v1/meta/seo` for `apps/site` to fold into route metadata.
 */
describe('SEO config', () => {
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

  const draftBody = (payload: unknown) => ({ kind: 'seo', key: 'default', payload });

  it('GET /api/v1/meta/seo returns the built-in default with an ETag when nothing is published', async () => {
    const res = await request(server).get('/api/v1/meta/seo').expect(200);
    const parsed = zSeoResponse.parse(res.body);
    expect(parsed.revision).toBe(0);
    expect(parsed.config.siteName).toBe(DEFAULT_SEO_CONFIG.siteName);
    expect(parsed.config.indexable).toBe(true);
    expect(res.headers.etag).toMatch(/^"seo-0-/);
    expect(res.headers['cache-control']).toContain('max-age');
  });

  it('draft → submit → a different reviewer approves → served publicly', async () => {
    const next = {
      ...DEFAULT_SEO_CONFIG,
      siteName: 'Acme Rentals',
      titleTemplate: '%s | Acme Rentals',
      defaultTitle: 'Acme Rentals — rent a car',
      canonicalBaseUrl: 'https://acme.example',
      twitterHandle: '@acme',
      ogImageUrl: 'https://acme.example/og.png',
    };

    const drafted = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(draftBody(next))
      .expect(201);
    const id = drafted.body.id as string;
    expect(drafted.body.kind).toBe('seo');

    await request(server)
      .post(`/api/v1/ops/config/versions/${id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

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

    const pub = await request(server).get('/api/v1/meta/seo').expect(200);
    const parsed = zSeoResponse.parse(pub.body);
    expect(parsed.revision).toBeGreaterThanOrEqual(1);
    expect(parsed.config.siteName).toBe('Acme Rentals');
    expect(parsed.config.titleTemplate).toBe('%s | Acme Rentals');
    expect(parsed.config.twitterHandle).toBe('@acme');
    expect(pub.headers.etag).not.toMatch(/^"seo-0-/);
  });

  it('rejects a non-https canonical URL', async () => {
    const res = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(draftBody({ ...DEFAULT_SEO_CONFIG, canonicalBaseUrl: 'http://insecure.example' }))
      .expect(422);
    expect(JSON.stringify(res.body)).toMatch(/canonicalBaseUrl|https/i);
  });

  it('rejects a malformed twitter handle', async () => {
    const res = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(draftBody({ ...DEFAULT_SEO_CONFIG, twitterHandle: 'acme (no @)' }))
      .expect(422);
    expect(JSON.stringify(res.body)).toMatch(/twitterHandle/);
  });

  it('preview echoes the resolved home <title> and canonical base', async () => {
    const res = await request(server)
      .post('/api/v1/ops/config/versions/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'seo', payload: DEFAULT_SEO_CONFIG })
      .expect(201);
    expect(String(res.body.examples.join(' '))).toMatch(/Home <title>|Canonical/);
  });

  it('a rental agent (no config.publish) cannot draft SEO', async () => {
    await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${agentToken}`)
      .send(draftBody(DEFAULT_SEO_CONFIG))
      .expect(403);
  });
});
