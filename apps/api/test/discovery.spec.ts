import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * STAGE-002 — Discovery & quote.
 *  - TEST-AVL: search returns priced, bookable options; quote lines sum to the total.
 *  - TEST-AVL concurrency: two takers of the last unit → exactly one hold succeeds.
 *  - TEST-CAT hours: a pickup outside operating hours is refused (no after-hours).
 *  - TEST-PRC: publishing a rate plan changes the customer price with no redeploy; a re-quote
 *    bumps the version and a later publish does not mutate an already-issued quote.
 *  - Permission: an agent cannot manage the catalogue.
 */
const isoIn = (days: number, hourUtc = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
};

describe('discovery / quote', () => {
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

  it('TEST-AVL-001 search returns priced, bookable options sorted by price', async () => {
    const res = await request(server)
      .post('/api/v1/discovery/search')
      .send({ pickupLocationCode: 'TST1', pickupAt: isoIn(3), returnAt: isoIn(6) })
      .expect(201);
    expect(res.body.state).toBe('fresh');
    expect(res.body.durationHours).toBe(72);
    const priced = res.body.options.filter(
      (o: { fromTotalMinor: number | null }) => o.fromTotalMinor != null,
    );
    expect(priced.length).toBeGreaterThan(1);
    const totals = priced.map((o: { fromTotalMinor: number }) => o.fromTotalMinor);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
    const economy = res.body.options.find(
      (o: { categoryCode: string }) => o.categoryCode === 'economy',
    );
    expect(economy.bookableCount).toBeGreaterThan(0);
    // 3 days * 3200 + 495 fee = 10095 taxable ; +20% => 12114
    expect(economy.fromTotalMinor).toBe(12114);
  });

  it('TEST-PRC-001 quote lines sum to the total and a hold is placed', async () => {
    const res = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(4),
        returnAt: isoIn(7),
        categoryCode: 'economy',
        holderKey: 'itest-sum',
      })
      .expect(201);
    const sum = res.body.lines.reduce(
      (a: number, l: { amountMinor: number }) => a + l.amountMinor,
      0,
    );
    expect(sum).toBe(res.body.totalMinor);
    expect(res.body.subtotalMinor + res.body.taxMinor).toBe(res.body.totalMinor);
    // no `unitId` was requested — a class-level hold never pins a specific car.
    expect(res.body.hold).toMatchObject({ unitPinned: false, unitId: null });
    expect(res.body.pickupAt).toMatch(/Z$/); // ISO-8601 UTC
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('TEST-AVL-002 two takers of the last unit — exactly one hold succeeds', async () => {
    // premium @ TST1 has 2 units — take one first, then race two more for the last.
    const win = { pickupLocationCode: 'TST1', pickupAt: isoIn(30), returnAt: isoIn(32) };
    await request(server)
      .post('/api/v1/discovery/quote')
      .send({ ...win, categoryCode: 'premium', holderKey: 'race-warmup' })
      .expect(201);

    const [a, b] = await Promise.all([
      request(server)
        .post('/api/v1/discovery/quote')
        .send({ ...win, categoryCode: 'premium', holderKey: 'race-a' }),
      request(server)
        .post('/api/v1/discovery/quote')
        .send({ ...win, categoryCode: 'premium', holderKey: 'race-b' }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 422]);
    const failed = a.status === 422 ? a : b;
    expect(failed.body.code).toBe('business_rule_violation');
    expect(failed.body.params.reason).toBe('no_availability');
  });

  it('TEST-CAT-001 a pickup outside operating hours is refused (no after-hours)', async () => {
    // TST2 opens 06:00 local (America/New_York). Ask for 06:00 UTC ≈ 01:00–02:00 local → closed.
    const res = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST2',
        pickupAt: isoIn(3, 6),
        returnAt: isoIn(6, 18),
        categoryCode: 'economy',
      })
      .expect(422);
    expect(res.body.code).toBe('business_rule_violation');
    expect(res.body.params.reason).toMatch(/^pickup_/);
  });

  it('TEST-PRC-002 publishing a rate plan changes the customer price with no redeploy', async () => {
    const before = await request(server)
      .post('/api/v1/discovery/search')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(8),
        returnAt: isoIn(10),
        categoryCode: 'suv',
      })
      .expect(201);
    const beforeTotal = before.body.options[0].fromTotalMinor as number;
    expect(beforeTotal).toBeGreaterThan(0);

    const created = await request(server)
      .post('/api/v1/ops/pricing/rate-plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryCode: 'suv',
        name: 'SUV — promo',
        effectiveFrom: '2020-01-01',
        baseDayMinor: 6000,
        hourMinor: 900,
        minDurationHours: 24,
        taxBps: 2000,
        fees: [{ code: 'reg_fee', label: 'Registration', amountMinor: 495, taxable: true }],
      })
      .expect(201);
    const planId = created.body[0].id as string;
    await request(server)
      .post(`/api/v1/ops/pricing/rate-plans/${planId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const after = await request(server)
      .post('/api/v1/discovery/search')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(8),
        returnAt: isoIn(10),
        categoryCode: 'suv',
      })
      .expect(201);
    const afterTotal = after.body.options[0].fromTotalMinor as number;
    // 2 days * 6000 + 495 => 12495 taxable ; +20% => 14994
    expect(afterTotal).toBe(14994);
    expect(afterTotal).not.toBe(beforeTotal);
  });

  it('TEST-PRC-003 an already-issued quote is not changed by a later re-quote / publish', async () => {
    const first = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(12),
        returnAt: isoIn(15),
        categoryCode: 'compact',
        holderKey: 'itest-quote-immutable',
      })
      .expect(201);
    const ref = first.body.reference as string;
    const firstTotal = first.body.totalMinor as number;

    const fetched = await request(server).get(`/api/v1/discovery/quotes/${ref}`).expect(200);
    expect(fetched.body.totalMinor).toBe(firstTotal);
    expect(fetched.body.version).toBe(1);
  });

  it('permission: an agent cannot create a vehicle category', async () => {
    await request(server)
      .post('/api/v1/ops/catalogue/categories')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        code: 'sneaky',
        class: 'economy',
        displayName: 'Sneaky',
        passengers: 4,
        luggage: 1,
        doors: 4,
      })
      .expect(403);
  });

  it('ops vehicle-category management: create, edit with If-Match, stale edit refused, deactivate/restore, and the public site sees it immediately', async () => {
    const code = `test_cat_${Date.now()}`;
    const features = await request(server)
      .get('/api/v1/ops/catalogue/features')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(features.body.length).toBeGreaterThan(0);
    const featureCode = features.body[0].code as string;

    const created = await request(server)
      .post('/api/v1/ops/catalogue/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code,
        class: 'economy',
        displayName: 'Test Category',
        passengers: 4,
        luggage: 1,
        doors: 4,
        transmission: 'manual',
        featureCodes: [featureCode],
      })
      .expect(201);
    expect(created.body.version).toBe(1);
    expect(created.body.features.map((f: { code: string }) => f.code)).toEqual([featureCode]);

    // the public catalogue reads the same category with no separate publish step
    const publicView = await request(server)
      .get(`/api/v1/catalogue/categories/${code}`)
      .expect(200);
    expect(publicView.body.displayName).toBe('Test Category');
    expect(publicView.body.passengers).toBe(4);

    // a stale If-Match (an older version than what's actually stored) is refused
    await request(server)
      .post('/api/v1/ops/catalogue/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('If-Match', '0')
      .send({
        code,
        class: 'economy',
        displayName: 'Stale Write',
        passengers: 4,
        luggage: 1,
        doors: 4,
      })
      .expect(409);

    // the correct current version is accepted and bumps the version again
    const edited = await request(server)
      .post('/api/v1/ops/catalogue/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('If-Match', String(created.body.version))
      .send({
        code,
        class: 'economy',
        displayName: 'Test Category Updated',
        passengers: 5,
        luggage: 2,
        doors: 2,
        transmission: 'automatic',
        featureCodes: [],
      })
      .expect(201);
    expect(edited.body.version).toBe(2);
    expect(edited.body.displayName).toBe('Test Category Updated');
    expect(edited.body.features).toEqual([]);

    // deactivate — disappears from the public catalogue list, still fetchable by direct code,
    // and the ops list (includeInactive) still shows it
    await request(server)
      .post(`/api/v1/ops/catalogue/categories/${code}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const publicList = await request(server).get('/api/v1/catalogue/categories').expect(200);
    expect(publicList.body.some((c: { code: string }) => c.code === code)).toBe(false);
    const opsList = await request(server)
      .get('/api/v1/ops/catalogue/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const inList = opsList.body.find((c: { code: string }) => c.code === code);
    expect(inList.isActive).toBe(false);

    // restore — back in the public list
    await request(server)
      .post(`/api/v1/ops/catalogue/categories/${code}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const publicListAfter = await request(server).get('/api/v1/catalogue/categories').expect(200);
    expect(publicListAfter.body.some((c: { code: string }) => c.code === code)).toBe(true);
  });

  it('ops vehicle-feature management: create, edit with If-Match, stale edit refused, deactivate/restore', async () => {
    const code = `test_feat_${Date.now()}`;

    const created = await request(server)
      .post('/api/v1/ops/catalogue/features')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, label: 'Test Feature', group: 'comfort', sortOrder: 5 })
      .expect(201);
    expect(created.body.version).toBe(1);
    expect(created.body.isActive).toBe(true);
    expect(created.body.label).toBe('Test Feature');

    // a stale If-Match (an older version than what's actually stored) is refused
    await request(server)
      .post('/api/v1/ops/catalogue/features')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('If-Match', '0')
      .send({ code, label: 'Stale Write', group: 'comfort' })
      .expect(409);

    // the correct current version is accepted and bumps the version again
    const edited = await request(server)
      .post('/api/v1/ops/catalogue/features')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('If-Match', String(created.body.version))
      .send({ code, label: 'Test Feature Updated', group: 'tech', sortOrder: 9 })
      .expect(201);
    expect(edited.body.version).toBe(2);
    expect(edited.body.label).toBe('Test Feature Updated');
    expect(edited.body.group).toBe('tech');

    // deactivate — still listed (ops list is always includeInactive), flips isActive
    await request(server)
      .post(`/api/v1/ops/catalogue/features/${code}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const afterOff = await request(server)
      .get('/api/v1/ops/catalogue/features')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(afterOff.body.find((f: { code: string }) => f.code === code).isActive).toBe(false);

    // restore
    await request(server)
      .post(`/api/v1/ops/catalogue/features/${code}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const afterOn = await request(server)
      .get('/api/v1/ops/catalogue/features')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(afterOn.body.find((f: { code: string }) => f.code === code).isActive).toBe(true);
  });

  it('permission: an agent cannot create a vehicle feature', async () => {
    await request(server)
      .post('/api/v1/ops/catalogue/features')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ code: 'sneaky_feature', label: 'Sneaky' })
      .expect(403);
  });

  it('locale-aware translation: a published French translation of a category name/description and a feature label is only served with ?locale=fr, and English is untouched', async () => {
    const catCode = `test_locale_cat_${Date.now()}`;
    const featCode = `test_locale_feat_${Date.now()}`;

    await request(server)
      .post('/api/v1/ops/catalogue/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: catCode,
        class: 'economy',
        displayName: 'English Name',
        description: 'English description',
        passengers: 4,
        luggage: 1,
        doors: 4,
      })
      .expect(201);
    await request(server)
      .post('/api/v1/ops/catalogue/features')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: featCode, label: 'English Label', group: 'comfort' })
      .expect(201);
    await request(server)
      .post('/api/v1/ops/catalogue/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('If-Match', '1')
      .send({
        code: catCode,
        class: 'economy',
        displayName: 'English Name',
        description: 'English description',
        passengers: 4,
        luggage: 1,
        doors: 4,
        featureCodes: [featCode],
      })
      .expect(201);

    // draft+publish (config.publish can set status: 'published' directly) the French strings
    await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        namespace: 'catalogue:category',
        key: catCode,
        localeCode: 'fr',
        value: 'Nom Français',
        status: 'published',
      })
      .expect(201);
    await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        namespace: 'catalogue:category',
        key: `${catCode}.description`,
        localeCode: 'fr',
        value: 'Description française',
        status: 'published',
      })
      .expect(201);
    await request(server)
      .post('/api/v1/config/translations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        namespace: 'catalogue:feature',
        key: featCode,
        localeCode: 'fr',
        value: 'Étiquette française',
        status: 'published',
      })
      .expect(201);

    // no locale / english: untranslated source strings
    const enView = await request(server).get(`/api/v1/catalogue/categories/${catCode}`).expect(200);
    expect(enView.body.displayName).toBe('English Name');
    expect(enView.body.description).toBe('English description');
    expect(enView.body.features[0].label).toBe('English Label');

    // ?locale=fr: published French overlay, for both the category and its embedded feature
    const frView = await request(server)
      .get(`/api/v1/catalogue/categories/${catCode}`)
      .query({ locale: 'fr' })
      .expect(200);
    expect(frView.body.displayName).toBe('Nom Français');
    expect(frView.body.description).toBe('Description française');
    expect(frView.body.features[0].label).toBe('Étiquette française');

    // an unrelated, untranslated locale falls back to the English source (no crash, no blank)
    const arView = await request(server)
      .get(`/api/v1/catalogue/categories/${catCode}`)
      .query({ locale: 'ar' })
      .expect(200);
    expect(arView.body.displayName).toBe('English Name');
  });

  it('SCREEN-CUS-003b: lists specific cars for a category+window, and quote pins the one picked', async () => {
    const win = { pickupLocationCode: 'TST1', pickupAt: isoIn(110), returnAt: isoIn(112) };
    const units = await request(server)
      .get('/api/v1/catalogue/categories/economy/units')
      .query({
        locationCode: win.pickupLocationCode,
        pickupAt: win.pickupAt,
        returnAt: win.returnAt,
      })
      .expect(200);
    expect(units.body.length).toBeGreaterThan(0);
    const pick = units.body[0];
    expect(pick).toMatchObject({ id: expect.any(String) });
    expect(pick).not.toHaveProperty('plate'); // never expose the plate/VIN publicly
    expect(pick).not.toHaveProperty('vin');

    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        ...win,
        categoryCode: 'economy',
        hold: true,
        holderKey: 'itest-pick-a',
        unitId: pick.id,
      })
      .expect(201);
    expect(quote.body.hold).toMatchObject({ unitPinned: true, unitId: pick.id });

    // the picked unit is no longer offered to a second shopper for the same window
    const after = await request(server)
      .get('/api/v1/catalogue/categories/economy/units')
      .query({
        locationCode: win.pickupLocationCode,
        pickupAt: win.pickupAt,
        returnAt: win.returnAt,
      })
      .expect(200);
    expect(after.body.some((u: { id: string }) => u.id === pick.id)).toBe(false);
  });

  it('SCREEN-CUS-003b: a bogus/unavailable unitId is refused rather than silently substituted', async () => {
    const win = { pickupLocationCode: 'TST1', pickupAt: isoIn(114), returnAt: isoIn(116) };
    const res = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        ...win,
        categoryCode: 'economy',
        hold: true,
        holderKey: 'itest-pick-bad',
        unitId: '00000000-0000-0000-0000-000000000000',
      })
      .expect(422);
    expect(res.body.code).toBe('business_rule_violation');
    expect(res.body.params.reason).toBe('unit_unavailable');
  });

  it('SCREEN-CUS-003b: two shoppers cannot pin the same specific car — the second is refused', async () => {
    const win = { pickupLocationCode: 'TST1', pickupAt: isoIn(118), returnAt: isoIn(120) };
    const units = await request(server)
      .get('/api/v1/catalogue/categories/economy/units')
      .query({
        locationCode: win.pickupLocationCode,
        pickupAt: win.pickupAt,
        returnAt: win.returnAt,
      })
      .expect(200);
    const pick = units.body[0].id as string;

    await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        ...win,
        categoryCode: 'economy',
        hold: true,
        holderKey: 'itest-clash-a',
        unitId: pick,
      })
      .expect(201);

    const clash = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        ...win,
        categoryCode: 'economy',
        hold: true,
        holderKey: 'itest-clash-b',
        unitId: pick,
      })
      .expect(422);
    expect(clash.body.code).toBe('business_rule_violation');
    expect(clash.body.params.reason).toBe('unit_unavailable');
  });
});
