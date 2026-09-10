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

  it('TEST-LKP-014 usage count: real references + in-use deactivation needs confirmation (S7-DEF-006)', async () => {
    // an unmapped type honestly reports it is not tracked (a 0 is not "safe to delete")
    const untracked = await request(server)
      .get('/api/v1/reference-data/types/refund_reason/values/goodwill/usage')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(untracked.body.tracked).toBe(false);
    expect(untracked.body.totalReferences).toBe(0);

    // a mapped type with no reference yet: tracked, count 0
    const idle = await request(server)
      .get('/api/v1/reference-data/types/block_reason/values/regulatory/usage')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(idle.body.tracked).toBe(true);
    expect(idle.body.totalReferences).toBe(0);

    // create a real reference: a maintenance block on a seeded unit uses block_reason='maintenance'
    const units = await request(server)
      .get('/api/v1/ops/fleet/units')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const unitId = (units.body.results as Array<{ id: string }>)[0]!.id;
    await request(server)
      .post('/api/v1/ops/fleet/blocks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        unitId,
        kind: 'maintenance',
        reasonCode: 'maintenance',
        startAt: new Date(Date.now() + 86_400_000).toISOString(),
        endAt: new Date(Date.now() + 172_800_000).toISOString(),
        note: 'usage-count test',
      })
      .expect(201);

    const used = await request(server)
      .get('/api/v1/reference-data/types/block_reason/values/maintenance/usage')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(used.body.totalReferences).toBeGreaterThanOrEqual(1);
    expect(
      used.body.consumers.find((c: { surface: string }) => c.surface === 'fleet.vehicle_block')
        .count,
    ).toBeGreaterThanOrEqual(1);

    // deactivating an in-use value is blocked without confirmation
    const values = await request(server)
      .get('/api/v1/reference-data/types/block_reason/values?includeInactive=true')
      .expect(200);
    const maintId = (values.body.values as Array<{ id: string; code: string }>).find(
      (v) => v.code === 'maintenance',
    )!.id;
    const blocked = await request(server)
      .post(`/api/v1/reference-data/types/block_reason/values/${maintId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(422);
    expect(blocked.body.params?.reason).toBe('lookup_value_in_use');

    // ...but succeeds with ?force=true
    await request(server)
      .post(`/api/v1/reference-data/types/block_reason/values/${maintId}/deactivate?force=true`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    // restore so the seeded set stays intact for other specs
    await request(server)
      .post(`/api/v1/reference-data/types/block_reason/values/${maintId}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  it('setting a value as default demotes the previous default (and bumps its version)', async () => {
    const type = 'cancel_reason';
    const mk = async (code: string) =>
      (
        await request(server)
          .post(`/api/v1/reference-data/types/${type}/values`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ code, label: code, isDefault: true })
          .expect(201)
      ).body;

    const a = await mk(`def_a_${Date.now()}`);
    const b = await mk(`def_b_${Date.now()}`);

    const list = await request(server)
      .get(`/api/v1/reference-data/types/${type}/values?includeInactive=true`)
      .expect(200);
    const rows = list.body.values as Array<{ id: string; isDefault: boolean; version: number }>;
    const rowA = rows.find((v) => v.id === a.id)!;
    const rowB = rows.find((v) => v.id === b.id)!;

    expect(rowB.isDefault).toBe(true);
    expect(rowA.isDefault).toBe(false); // demoted
    expect(rowA.version).toBeGreaterThan(a.version); // demotion bumped its version

    // cleanup
    for (const id of [a.id, b.id]) {
      await request(server)
        .post(`/api/v1/reference-data/types/${type}/values/${id}/deactivate?force=true`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
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
