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
  let lookupManagerToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    lookupManagerToken = (
      await signIn(app, 'test-lookup-manager@example.test', 'Test-Passw0rd!', 'staff')
    ).accessToken;
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

  it('the catalogue list (batched counts) agrees with the single-type detail endpoint', async () => {
    const detail = await request(server)
      .get('/api/v1/reference-data/types/cancel_reason')
      .expect(200);
    const list = await request(server)
      .get('/api/v1/reference-data/types?search=cancel_reason')
      .expect(200);
    const row = (
      list.body as Array<{
        code: string;
        activeValueCount: number;
        inactiveValueCount: number;
      }>
    ).find((t) => t.code === 'cancel_reason');
    expect(row).toBeTruthy();
    expect(row!.activeValueCount).toBe(detail.body.activeValueCount);
    expect(row!.inactiveValueCount).toBe(detail.body.inactiveValueCount);
  });

  it('a filter matching no type returns an empty list rather than erroring', async () => {
    const res = await request(server)
      .get('/api/v1/reference-data/types?search=no-such-lookup-type-xyz')
      .expect(200);
    expect(res.body).toEqual([]);
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
    // the full per-locale label map is on every value (for the ops editor)
    expect(fr.translations).toMatchObject({ en: 'Bad weather', fr: 'Mauvais temps' });

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

    // an anonymous caller only ever sees the live option set — `includeInactive` is ignored
    const anonInactive = await request(server)
      .get(`/api/v1/reference-data/types/${type}/values?includeInactive=true`)
      .expect(200);
    expect(anonInactive.body.values.find((v: { code: string }) => v.code === code)).toBeUndefined();

    // ...but an authenticated caller can still resolve it for historical records
    const withInactive = await request(server)
      .get(`/api/v1/reference-data/types/${type}/values?includeInactive=true`)
      .set('Authorization', `Bearer ${adminToken}`)
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

  it('label resolution walks a locale’s own configured fallback chain, not the static en/fr/ar list (DEC-024)', async () => {
    // "sw" only exists in this run — a dashboard-added language whose configured fallback goes
    // through French before English, same shape as the notify-template fallback fix (#67).
    await request(server)
      .post('/api/v1/config/locales')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'sw',
        nativeName: 'Kiswahili',
        englishName: 'Swahili',
        direction: 'ltr',
        fallbackChain: ['fr'],
      })
      .expect(201);
    await request(server)
      .post('/api/v1/config/locales/sw/activate')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const type = 'cancel_reason';
    const code = `storm_${Date.now()}`;
    await request(server)
      .post(`/api/v1/reference-data/types/${type}/values`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, label: 'Storm', translations: { fr: 'Tempête' } })
      .expect(201);

    const res = await request(server)
      .get(`/api/v1/reference-data/types/${type}/values?locale=sw`)
      .expect(200);
    const v = res.body.values.find((x: { code: string }) => x.code === code);
    // resolved via sw -> fr -> en to the French label, not straight past sw to English
    expect(v.labelLocale).toBe('fr');
    expect(v.label).toBe('Tempête');
  });

  it('lookup.manage alone can browse the translation catalogue (needed to find what to draft)', async () => {
    await request(server)
      .get('/api/v1/config/translations/completeness')
      .set('Authorization', `Bearer ${lookupManagerToken}`)
      .expect(200);
    await request(server)
      .get('/api/v1/config/translations?namespace=lookup:cancel_reason&locale=fr')
      .set('Authorization', `Bearer ${lookupManagerToken}`)
      .expect(200);
  });

  it('lookup.manage alone can draft a lookup:* translation but not reach another namespace or publish directly', async () => {
    // a bare lookup.manage role can edit the label it owns...
    const ok = await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${lookupManagerToken}`)
      .send({
        namespace: 'lookup:cancel_reason',
        key: 'other',
        localeCode: 'fr',
        value: 'Autre (test)',
      })
      .expect(201);
    expect(ok.body.status).toBe('draft');

    // ...but not an unrelated UI-copy namespace...
    await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${lookupManagerToken}`)
      .send({ namespace: 'common', key: 'action.save', localeCode: 'fr', value: 'Hacked' })
      .expect(403);

    // ...nor publish directly, even within its own namespace — that stays config.publish's job.
    await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${lookupManagerToken}`)
      .send({
        namespace: 'lookup:cancel_reason',
        key: 'other',
        localeCode: 'fr',
        value: 'Autre (test)',
        status: 'published',
      })
      .expect(403);
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

    // add the legal fr translation, then publish succeeds and reports the count
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
    const pub = await request(server)
      .post('/api/v1/config/translations/test_ns/fr/publish')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(pub.body.published).toBe(2); // hello + legal.terms
  });

  it('the key catalogue + coverage come from the bundled `common` strings', async () => {
    const list = await request(server)
      .get('/api/v1/config/translations?namespace=common&locale=fr')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = (list.body as Array<{ key: string; source: string }>).find(
      (r) => r.key === 'action.search',
    );
    expect(row?.source).toBe('Search');
    expect(list.body.length).toBeGreaterThan(1000);

    const cov = await request(server)
      .get('/api/v1/config/translations/completeness')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const commonFr = (
      cov.body.rows as Array<{ namespace: string; locale: string; total: number }>
    ).find((r) => r.namespace === 'common' && r.locale === 'fr');
    expect(commonFr?.total).toBe(list.body.length);
  });

  it('an in-progress edit never blanks a live translation (publishedValue is frozen)', async () => {
    const KEY = 'action.search';
    // publish an fr override
    await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        namespace: 'common',
        key: KEY,
        localeCode: 'fr',
        value: 'Chercher',
        status: 'published',
      })
      .expect(201);
    let bundle = await request(server)
      .get('/api/v1/meta/translations?namespace=common&locale=fr')
      .expect(200);
    expect(bundle.body[KEY]).toBe('Chercher');

    // start editing it — save a draft
    await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        namespace: 'common',
        key: KEY,
        localeCode: 'fr',
        value: 'Rechercher (wip)',
        status: 'draft',
      })
      .expect(201);

    // the live bundle still serves the last published value
    bundle = await request(server)
      .get('/api/v1/meta/translations?namespace=common&locale=fr')
      .expect(200);
    expect(bundle.body[KEY]).toBe('Chercher');

    // the editor shows both
    const list = await request(server)
      .get('/api/v1/config/translations?namespace=common&locale=fr')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = (list.body as Array<{ key: string; translation: string; published: string }>).find(
      (r) => r.key === KEY,
    )!;
    expect(row.translation).toBe('Rechercher (wip)');
    expect(row.published).toBe('Chercher');
  });

  it('a translation save is optimistically locked — a stale version conflicts, not clobbers', async () => {
    const KEY = 'action.cancel';
    const initial = (
      await request(server)
        .get('/api/v1/config/translations?namespace=common&locale=fr')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
    ).body.find((r: { key: string }) => r.key === KEY);

    // reviewer A saves a draft, loaded at `initial.version`
    await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        namespace: 'common',
        key: KEY,
        localeCode: 'fr',
        value: 'Annuler (A)',
        status: 'draft',
        expectedVersion: initial.version,
      })
      .expect(201);

    // reviewer B, still holding the same stale `initial.version`, tries to save over it
    const conflict = await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        namespace: 'common',
        key: KEY,
        localeCode: 'fr',
        value: 'Annuler (B)',
        status: 'draft',
        expectedVersion: initial.version,
      })
      .expect(409);
    expect(conflict.body.code).toBe('state_conflict');

    // A's save stands — B's was rejected, not silently applied
    const current = (
      await request(server)
        .get('/api/v1/config/translations?namespace=common&locale=fr')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
    ).body.find((r: { key: string }) => r.key === KEY);
    expect(current.translation).toBe('Annuler (A)');
    expect(current.version).toBe(initial.version + 1);
  });

  it('a lookup value update is atomically version-guarded — two genuinely concurrent saves cannot both win', async () => {
    const type = 'cancel_reason';
    const code = `race_${Date.now()}`;
    const created = await request(server)
      .post(`/api/v1/reference-data/types/${type}/values`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, label: 'Race original' })
      .expect(201);
    const startVersion = created.body.version;

    // two requests race against the SAME starting version — a sequential await-then-await
    // wouldn't exercise the actual UPDATE...WHERE race, so fire them concurrently.
    const [a, b] = await Promise.allSettled([
      request(server)
        .post(`/api/v1/reference-data/types/${type}/values/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('If-Match', String(startVersion))
        .send({ label: 'Race A' }),
      request(server)
        .post(`/api/v1/reference-data/types/${type}/values/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('If-Match', String(startVersion))
        .send({ label: 'Race B' }),
    ]);

    const results = [a, b].map((r) => (r.status === 'fulfilled' ? r.value.status : -1));
    // exactly one wins (201), the other gets a clean version conflict (409) — never both 201
    // (which would mean the loser's write was silently accepted and the winner clobbered)
    expect(results.filter((s) => s === 201)).toHaveLength(1);
    expect(results.filter((s) => s === 409)).toHaveLength(1);
    const loser = [a, b].find((r) => r.status === 'fulfilled' && r.value.status === 409) as
      | PromiseFulfilledResult<request.Response>
      | undefined;
    expect(loser?.value.body.code).toBe('version_conflict');

    const final = await request(server)
      .get(`/api/v1/reference-data/types/${type}/values?includeInactive=true`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = final.body.values.find((v: { id: string }) => v.id === created.body.id);
    // the surviving value came from exactly one of the two writers, and the version only moved once
    expect(['Race A', 'Race B']).toContain(row.label);
    expect(row.version).toBe(startVersion + 1);
  });

  it('a freshly seeded catalogue is not a wall of "outdated" badges', async () => {
    const list = await request(server)
      .get('/api/v1/config/translations?namespace=common&locale=fr')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const outdated = (list.body as Array<{ outdated: boolean; status: string }>).filter(
      (r) => r.outdated,
    );
    expect(outdated).toHaveLength(0);
    // and the seeded fr strings are actually published (coverage is not 0)
    const published = (list.body as Array<{ status: string }>).filter(
      (r) => r.status === 'published',
    );
    expect(published.length).toBeGreaterThan(1000);
  });

  it('a reference-data label edit publishes immediately (live + counted, no review step)', async () => {
    const type = 'cancel_reason';
    const code = `roadclosure_${Date.now()}`;
    const created = await request(server)
      .post(`/api/v1/reference-data/types/${type}/values`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, label: 'Road closed', translations: { fr: 'Route fermée' } })
      .expect(201);
    expect(created.body.code).toBe(code);

    // the fr label is live on the public bundle straight away — no publish action needed
    const bundle = await request(server)
      .get(`/api/v1/meta/translations?namespace=lookup:${type}&locale=fr`)
      .expect(200);
    expect(bundle.body[code]).toBe('Route fermée');

    // and the Translations screen shows it as published with a frozen live value
    const list = await request(server)
      .get(`/api/v1/config/translations?namespace=lookup:${type}&locale=fr`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = (
      list.body as Array<{
        key: string;
        translation: string;
        published: string;
        status: string;
        outdated: boolean;
      }>
    ).find((r) => r.key === code)!;
    expect(row.status).toBe('published');
    expect(row.translation).toBe('Route fermée');
    expect(row.published).toBe('Route fermée');
    expect(row.outdated).toBe(false);
  });

  it('a draft edit from the Translations screen never blanks a live reference-data label', async () => {
    // the generic Translations screen can open any `lookup:*` namespace and save a draft — the
    // published-label read path (`GET .../values`, what every <LookupSelect> consumes) must keep
    // serving the frozen live label while that draft is in progress, not drop it.
    const type = 'cancel_reason';
    const code = `weatherclosure_${Date.now()}`;
    await request(server)
      .post(`/api/v1/reference-data/types/${type}/values`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, label: 'Severe weather', translations: { fr: 'Intempéries' } })
      .expect(201);

    const before = await request(server)
      .get(`/api/v1/reference-data/types/${type}/values?locale=fr`)
      .expect(200);
    expect(before.body.values.find((v: { code: string }) => v.code === code)?.label).toBe(
      'Intempéries',
    );

    // start editing the fr label from the Translations screen — save a draft, don't publish
    await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        namespace: `lookup:${type}`,
        key: code,
        localeCode: 'fr',
        value: 'Intempéries (wip)',
        status: 'draft',
      })
      .expect(201);

    // the live selector still serves the frozen published label, not the draft and not English
    const after = await request(server)
      .get(`/api/v1/reference-data/types/${type}/values?locale=fr`)
      .expect(200);
    const value = after.body.values.find((v: { code: string }) => v.code === code);
    expect(value?.label).toBe('Intempéries');
    expect(value?.label).not.toBe('Severe weather');
  });

  it('reference-data types show up in the translation catalogue with every active value', async () => {
    // the source catalogue for a lookup namespace is the type's active values, not just the rows
    // that happen to have a translation override
    const list = await request(server)
      .get('/api/v1/config/translations?namespace=lookup:cancel_reason&locale=fr')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.length).toBeGreaterThan(1);
    const codes = (list.body as Array<{ key: string; source: string }>).map((r) => r.key);
    expect(new Set(codes).size).toBe(codes.length); // no dupes

    const cov = await request(server)
      .get('/api/v1/config/translations/completeness')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const rowFr = (
      cov.body.rows as Array<{ namespace: string; locale: string; total: number }>
    ).find((r) => r.namespace === 'lookup:cancel_reason' && r.locale === 'fr');
    expect(rowFr?.total).toBe(list.body.length);
  });

  it('coverage never reports 100% next to a non-zero "missing" count', async () => {
    const cov = await request(server)
      .get('/api/v1/config/translations/completeness')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    for (const r of cov.body.rows as Array<{
      coveragePct: number;
      missing: number;
      total: number;
      published: number;
    }>) {
      expect(r.coveragePct === 100).toBe(r.missing === 0);
      expect(r.published).toBeLessThanOrEqual(r.total);
      expect(r.missing).toBeGreaterThanOrEqual(0);
    }
  });
});
