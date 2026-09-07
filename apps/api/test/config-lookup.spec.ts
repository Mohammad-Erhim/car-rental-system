import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * TEST-LKP-001..015 (STAGE-001). Dynamic retrieval; management (create/edit/deactivate/restore);
 * a lookup edit propagates to a consuming selector with no redeploy (ETag bumps, value visible);
 * deactivated value hidden from new selection but resolvable on history; read-only type rejected;
 * permission enforcement; translation publish blocks on missing mandatory key.
 */
describe('config / reference data', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let agentToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
  });
  afterAll(closeTestApp);

  it('TEST-LKP-001 dynamic retrieval: values come from the DB with stable code + localized label', async () => {
    const res = await request(server)
      .get('/api/v1/reference-data/types/cancel_reason/values?locale=en')
      .expect(200);
    expect(res.body.type.code).toBe('cancel_reason');
    expect(res.body.etag).toMatch(/^W\/"lkp-cancel_reason-/);
    const codes = res.body.values.map((v: { code: string }) => v.code);
    expect(codes).toContain('other');
    expect(res.body.values.every((v: { label: string }) => typeof v.label === 'string')).toBe(true);
  });

  it('TEST-LKP-005 a system-fixed type rejects value mutation', async () => {
    const created = await request(server)
      .post('/api/v1/reference-data/types/reservation_state/values')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'bogus', label: 'Bogus' })
      .expect(403);
    expect(created.body.params?.reason).toBe('read_only');
  });

  it('TEST-LKP-004/009/011 create → appears in selector → edit label → deactivate → history-safe', async () => {
    const type = 'cancel_reason';
    const before = await request(server)
      .get(`/api/v1/reference-data/types/${type}/values`)
      .expect(200);
    const beforeEtag = before.body.etag;
    const code = `weather_${Date.now()}`;

    // vertical permission: an agent (no lookup.manage) cannot create
    await request(server)
      .post(`/api/v1/reference-data/types/${type}/values`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ code, label: 'Bad weather' })
      .expect(403);

    const created = await request(server)
      .post(`/api/v1/reference-data/types/${type}/values`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, label: 'Bad weather', translations: { fr: 'Mauvais temps' } })
      .expect(201);
    expect(created.body.code).toBe(code);

    // propagation with no redeploy: a fresh GET shows the new value + a bumped ETag
    const afterCreate = await request(server)
      .get(`/api/v1/reference-data/types/${type}/values?locale=fr`)
      .expect(200);
    expect(afterCreate.body.etag).not.toBe(beforeEtag);
    const fr = afterCreate.body.values.find((v: { code: string }) => v.code === code);
    expect(fr.label).toBe('Mauvais temps');
    expect(fr.labelLocale).toBe('fr');

    // edit the label
    await request(server)
      .post(`/api/v1/reference-data/types/${type}/values/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Severe weather' })
      .expect(201);
    const afterEdit = await request(server)
      .get(`/api/v1/reference-data/types/${type}/values`)
      .expect(200);
    expect(afterEdit.body.values.find((v: { code: string }) => v.code === code).label).toBe(
      'Severe weather',
    );

    // deactivate -> hidden from new selection
    await request(server)
      .post(`/api/v1/reference-data/types/${type}/values/${created.body.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const afterDeact = await request(server)
      .get(`/api/v1/reference-data/types/${type}/values`)
      .expect(200);
    expect(afterDeact.body.values.find((v: { code: string }) => v.code === code)).toBeUndefined();

    // ...but still resolvable for historical records
    const withInactive = await request(server)
      .get(`/api/v1/reference-data/types/${type}/values?includeInactive=true`)
      .expect(200);
    expect(withInactive.body.values.find((v: { code: string }) => v.code === code).isActive).toBe(
      false,
    );

    // restore
    await request(server)
      .post(`/api/v1/reference-data/types/${type}/values/${created.body.id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  it('TEST-LKP-012 integrity check surfaces in /health/ready (no drift)', async () => {
    const health = await request(server).get('/health/ready').expect(200);
    expect(health.body.checks.lookups.status).toBe('ok');
  });

  it('TEST-I18N translation publish blocks on a missing mandatory (legal.*) key', async () => {
    // seed a legal key in en + an in_review non-legal fr key, then attempt publish
    await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        namespace: 'test_ns',
        key: 'legal.terms',
        localeCode: 'en',
        value: 'Terms',
        status: 'published',
      })
      .expect(201);
    await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        namespace: 'test_ns',
        key: 'hello',
        localeCode: 'en',
        value: 'Hello',
        status: 'published',
      })
      .expect(201);
    await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        namespace: 'test_ns',
        key: 'hello',
        localeCode: 'fr',
        value: 'Bonjour',
        status: 'in_review',
      })
      .expect(201);

    const blocked = await request(server)
      .post('/api/v1/config/translations/test_ns/fr/publish')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(422);
    expect(blocked.body.params?.reason).toBe('missing_mandatory');

    // add the legal fr translation, then publish succeeds
    await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        namespace: 'test_ns',
        key: 'legal.terms',
        localeCode: 'fr',
        value: 'Conditions',
        status: 'in_review',
      })
      .expect(201);
    await request(server)
      .post('/api/v1/config/translations/test_ns/fr/publish')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });
});
