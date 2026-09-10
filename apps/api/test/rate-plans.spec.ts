import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * SCREEN-OPS-025/026 — rate plan management. Draft → publish (immutable); publishing supersedes
 * only the published plans it overlaps in time; scope (category / location / currency) is
 * validated against the catalogue; a draft can be deleted, a published plan cannot.
 */
describe('rate plans', () => {
  let server: ReturnType<typeof httpServer>;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const base = {
    categoryCode: 'economy',
    baseDayMinor: 5000,
    minDurationHours: 24,
    taxBps: 2000,
  };

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    token = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
  });
  afterAll(closeTestApp);

  const create = (body: Record<string, unknown>) =>
    request(server).post('/api/v1/ops/pricing/rate-plans').set(auth()).send(body);

  it('rejects a plan whose category / location / currency is not in the catalogue', async () => {
    await create({ ...base, name: 'bad cat', effectiveFrom: '2020-01-01', categoryCode: 'nope' })
      .expect(422)
      .expect((r) => expect(r.body.fieldErrors?.[0]?.path).toBe('categoryCode'));

    await create({
      ...base,
      name: 'bad loc',
      effectiveFrom: '2020-01-01',
      locationCode: 'ZZZZ',
    })
      .expect(422)
      .expect((r) => expect(r.body.fieldErrors?.[0]?.path).toBe('locationCode'));

    await create({ ...base, name: 'bad ccy', effectiveFrom: '2020-01-01', currency: 'ZZZ' })
      .expect(422)
      .expect((r) => expect(r.body.fieldErrors?.[0]?.path).toBe('currency'));

    await create({
      ...base,
      name: 'bad base',
      effectiveFrom: '2020-01-01',
      baseDayMinor: 0,
    }).expect(422);

    // a negative "fee" (a discount hack) is rejected
    await create({
      ...base,
      name: 'neg fee',
      effectiveFrom: '2020-01-01',
      fees: [{ code: 'credit', label: 'Credit', amountMinor: -500 }],
    }).expect(422);
  });

  it('a draft edit needs a matching If-Match; a stale one conflicts (409)', async () => {
    const draft = (
      await create({ ...base, name: `concur ${Date.now()}`, effectiveFrom: '2099-01-01' }).expect(
        201,
      )
    ).body[0];
    // fetch its current version
    const list = (
      await request(server).get('/api/v1/ops/pricing/rate-plans').set(auth()).expect(200)
    ).body as Array<{ id: string; version: number }>;
    const version = list.find((p) => p.id === draft.id)!.version;

    await request(server)
      .post('/api/v1/ops/pricing/rate-plans')
      .set(auth())
      .set('If-Match', String(version + 5))
      .send({ ...base, id: draft.id, name: 'stale', effectiveFrom: '2099-01-01' })
      .expect(409);

    await request(server)
      .post('/api/v1/ops/pricing/rate-plans')
      .set(auth())
      .set('If-Match', String(version))
      .send({ ...base, id: draft.id, name: 'fresh', effectiveFrom: '2099-01-01' })
      .expect(201);

    // clean up
    await request(server).delete(`/api/v1/ops/pricing/rate-plans/${draft.id}`).set(auth());
  });

  it('a retired plan cannot be edited via its id', async () => {
    const a = (
      await create({ ...base, name: `ret-a ${Date.now()}`, effectiveFrom: '2098-01-01' }).expect(
        201,
      )
    ).body[0];
    const b = (
      await create({ ...base, name: `ret-b ${Date.now()}`, effectiveFrom: '2098-01-01' }).expect(
        201,
      )
    ).body[0];
    for (const p of [a, b]) {
      await request(server)
        .post(`/api/v1/ops/pricing/rate-plans/${p.id}/publish`)
        .set(auth())
        .expect(201);
    }
    // b overlaps a → a is retired; editing a via id now fails
    await request(server)
      .post('/api/v1/ops/pricing/rate-plans')
      .set(auth())
      .send({ ...base, id: a.id, name: 'nope', effectiveFrom: '2098-01-01' })
      .expect(422)
      .expect((r) => expect(r.body.params?.reason).toBe('plan_immutable'));
  });

  it('publishing supersedes an overlapping plan but keeps a non-overlapping (seasonal) one', async () => {
    const winter = (
      await create({
        ...base,
        name: `winter ${Date.now()}`,
        effectiveFrom: '2099-01-01',
        effectiveTo: '2099-03-31',
      }).expect(201)
    ).body[0];
    await request(server)
      .post(`/api/v1/ops/pricing/rate-plans/${winter.id}/publish`)
      .set(auth())
      .expect(201);

    // a summer plan for the same scope, no date overlap → winter stays published
    const summer = (
      await create({
        ...base,
        name: `summer ${Date.now()}`,
        effectiveFrom: '2099-06-01',
        effectiveTo: '2099-08-31',
      }).expect(201)
    ).body[0];
    await request(server)
      .post(`/api/v1/ops/pricing/rate-plans/${summer.id}/publish`)
      .set(auth())
      .expect(201);

    let list = (await request(server).get('/api/v1/ops/pricing/rate-plans').set(auth()).expect(200))
      .body as Array<{ id: string; status: string }>;
    expect(list.find((p) => p.id === winter.id)?.status).toBe('published');
    expect(list.find((p) => p.id === summer.id)?.status).toBe('published');

    // a replacement winter plan that overlaps → the first winter is retired, summer untouched
    const winter2 = (
      await create({
        ...base,
        name: `winter2 ${Date.now()}`,
        baseDayMinor: 4000,
        effectiveFrom: '2099-02-01',
        effectiveTo: '2099-04-30',
      }).expect(201)
    ).body[0];
    await request(server)
      .post(`/api/v1/ops/pricing/rate-plans/${winter2.id}/publish`)
      .set(auth())
      .expect(201);

    list = (await request(server).get('/api/v1/ops/pricing/rate-plans').set(auth()).expect(200))
      .body as Array<{ id: string; status: string }>;
    expect(list.find((p) => p.id === winter.id)?.status).toBe('retired');
    expect(list.find((p) => p.id === winter2.id)?.status).toBe('published');
    expect(list.find((p) => p.id === summer.id)?.status).toBe('published');
  });

  it('a draft can be deleted; a published plan cannot', async () => {
    const draft = (
      await create({
        ...base,
        name: `to delete ${Date.now()}`,
        effectiveFrom: '2099-01-01',
      }).expect(201)
    ).body[0];
    await request(server)
      .delete(`/api/v1/ops/pricing/rate-plans/${draft.id}`)
      .set(auth())
      .expect(200);
    const list = (
      await request(server).get('/api/v1/ops/pricing/rate-plans').set(auth()).expect(200)
    ).body as Array<{ id: string }>;
    expect(list.some((p) => p.id === draft.id)).toBe(false);

    const pub = (
      await create({ ...base, name: `keep ${Date.now()}`, effectiveFrom: '2099-01-01' }).expect(201)
    ).body[0];
    await request(server)
      .post(`/api/v1/ops/pricing/rate-plans/${pub.id}/publish`)
      .set(auth())
      .expect(201);
    await request(server)
      .delete(`/api/v1/ops/pricing/rate-plans/${pub.id}`)
      .set(auth())
      .expect(422)
      .expect((r) => expect(r.body.params?.reason).toBe('not_a_draft'));
  });

  it('the list carries each plan’s duration tiers', async () => {
    const list = (
      await request(server).get('/api/v1/ops/pricing/rate-plans').set(auth()).expect(200)
    ).body as Array<{ categoryCode: string; status: string; tiers: unknown[] }>;
    const seeded = list.find((p) => p.status === 'published' && Array.isArray(p.tiers));
    expect(seeded).toBeTruthy();
    expect(Array.isArray(seeded!.tiers)).toBe(true);
  });
});
