import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { account, staffProfile } from '../src/database/schema/iam';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * Location scope — what a staff account limited to specific branches can and cannot see or do.
 * `test-manager` is temporarily confined to TST2 (a manager holds every permission, so a 403 here
 * is the location rule, not a missing permission) and restored afterwards.
 */
const isoIn = (days: number, hour = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('location scope', () => {
  let server: ReturnType<typeof httpServer>;
  let db: Database;
  let managerId: string;
  let admin: string;
  let scoped: string; // manager confined to TST2
  let customer: string;
  let oneWayRef: string; // pickup TST1 → return TST2
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (path: string, t: string) => request(server).get(path).set(auth(t));

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    db = app.get<Database>(DB);
    const [mgr] = await db
      .select({ id: account.id })
      .from(account)
      .where(eq(account.emailNormalized, 'test-manager@example.test'));
    managerId = mgr!.id;
    await db
      .update(staffProfile)
      .set({ locationScope: ['TST2'] })
      .where(eq(staffProfile.accountId, managerId));
    admin = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    scoped = (await signIn(app, 'test-manager@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    customer = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;

    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        returnLocationCode: 'TST2',
        pickupAt: isoIn(50),
        returnAt: isoIn(53),
        categoryCode: 'economy',
        holderKey: `ls-${Math.random().toString(36).slice(2)}`,
      })
      .expect(201);
    const booked = await request(server)
      .post('/api/v1/bookings/confirm')
      .set(auth(customer))
      .send({
        quoteReference: quote.body.reference,
        drivers: [{ role: 'primary_renter', fullName: 'One Way', email: 'oneway@example.test' }],
        acceptTerms: true,
        paymentToken: 'tok_ok',
      })
      .expect(201);
    oneWayRef = booked.body.reference;
  });

  afterAll(async () => {
    await db
      .update(staffProfile)
      .set({ locationScope: [] })
      .where(eq(staffProfile.accountId, managerId));
    await closeTestApp();
  });

  describe('options endpoint (what every filter and picker is built from)', () => {
    it('an org-wide actor gets every location with its status', async () => {
      const res = await get('/api/v1/ops/locations/options', admin).expect(200);
      expect(res.body.restricted).toBe(false);
      const codes = res.body.options.map((l: { code: string }) => l.code);
      expect(codes).toEqual(expect.arrayContaining(['TST1', 'TST2']));
      expect(res.body.options[0]).toEqual(
        expect.objectContaining({ id: expect.any(String), status: expect.any(String) }),
      );
    });

    it('a scoped actor gets only their own locations — reflecting the scope right now', async () => {
      const res = await get('/api/v1/ops/locations/options', scoped).expect(200);
      expect(res.body.restricted).toBe(true);
      expect(res.body.options.map((l: { code: string }) => l.code)).toEqual(['TST2']);
    });

    it('is staff-only', async () => {
      await request(server).get('/api/v1/ops/locations/options').expect(401);
      await get('/api/v1/ops/locations/options', customer).expect(403);
    });
  });

  describe('multi-location filters', () => {
    it('accept a comma-separated list; blanks and duplicates are ignored', async () => {
      await get('/api/v1/ops/fleet/units?locationCode=TST1,TST2', admin).expect(200);
      await get('/api/v1/ops/fleet/units?locationCode=,TST1,,TST1', admin).expect(200);
    });

    it('a scoped actor asking for any location outside their scope is refused, never narrowed', async () => {
      const r1 = await get('/api/v1/ops/fleet/units?locationCode=TST1', scoped).expect(403);
      expect(r1.body.title).toContain('TST1');
      await get('/api/v1/ops/fleet/units?locationCode=TST2,TST1', scoped).expect(403);
      await get('/api/v1/ops/reservations?view=all&locationCode=TST2,TST1', scoped).expect(403);
      await get('/api/v1/ops/rentals?locationCode=TST1', scoped).expect(403);
      await get('/api/v1/ops/search?q=ab&locationCode=TST1', scoped).expect(403);
      await get('/api/v1/ops/dashboard?locationCode=TST1', scoped).expect(403);
      await get('/api/v1/ops/fleet/blocks?status=active&locationCode=TST1', scoped).expect(403);
    });

    it('the fleet holds list takes the same location filter', async () => {
      await get('/api/v1/ops/fleet/blocks?status=active&locationCode=TST1,TST2', admin).expect(200);
    });

    it('fleet units narrow to exactly the requested set', async () => {
      const both = await get('/api/v1/ops/fleet/units?locationCode=TST1,TST2', admin);
      const one = await get('/api/v1/ops/fleet/units?locationCode=TST2', admin);
      const other = await get('/api/v1/ops/fleet/units?locationCode=TST1', admin);
      expect(one.body.total + other.body.total).toBe(both.body.total);
      const scopedNoFilter = await get('/api/v1/ops/fleet/units', scoped).expect(200);
      expect(scopedNoFilter.body.total).toBe(one.body.total);
    });
  });

  describe('a one-way booking belongs to both branches', () => {
    it("the return branch sees it in the browsable list but not in the pickup branch's work queue", async () => {
      const all = await get('/api/v1/ops/reservations?view=all', scoped).expect(200);
      expect(all.body.results.map((r: { reference: string }) => r.reference)).toContain(oneWayRef);
      const queue = await get('/api/v1/ops/reservations?view=queue', scoped).expect(200);
      expect(queue.body.results.map((r: { reference: string }) => r.reference)).not.toContain(
        oneWayRef,
      );
    });

    it('the return branch can open it and find it in search', async () => {
      await get(`/api/v1/reservations/${oneWayRef}`, scoped).expect(200);
      const hit = await get(`/api/v1/ops/search?q=${oneWayRef}`, scoped).expect(200);
      expect(hit.body.results.map((r: { reference: string }) => r.reference)).toContain(oneWayRef);
    });

    it('filtering the admin list to the return branch also finds it', async () => {
      const res = await get('/api/v1/ops/reservations?view=all&locationCode=TST2', admin);
      expect(res.body.results.map((r: { reference: string }) => r.reference)).toContain(oneWayRef);
    });
  });

  describe('reports', () => {
    it('lists each definition with how it relates to a scope, and whether this actor may run it', async () => {
      const res = await get('/api/v1/ops/reports', scoped).expect(200);
      const by = Object.fromEntries(
        res.body.map((d: { queryKind: string }) => [d.queryKind, d]),
      ) as Record<string, { scope: string; available: boolean }>;
      expect(by.fleet_utilisation).toMatchObject({ scope: 'location', available: true });
      expect(by.open_cases).toMatchObject({ scope: 'org_wide', available: false });
      const adminList = await get('/api/v1/ops/reports', admin).expect(200);
      expect(adminList.body.every((d: { available: boolean }) => d.available)).toBe(true);
    });

    it('fleet utilisation and refunds are confined to the actor’s branches', async () => {
      const units = await get('/api/v1/ops/fleet/units?locationCode=TST2', admin);
      const run = await request(server)
        .post('/api/v1/ops/reports/fleet_utilisation/run')
        .set(auth(scoped))
        .send({})
        .expect(201);
      const total = run.body.rows.reduce((n: number, r: { units: number }) => n + r.units, 0);
      expect(total).toBe(units.body.total);
      expect(run.body.scopeNote).toBe('Scoped to TST2');
      const adminRun = await request(server)
        .post('/api/v1/ops/reports/fleet_utilisation/run')
        .set(auth(admin))
        .send({})
        .expect(201);
      expect(adminRun.body.scopeNote).toBe('All locations');
      await request(server)
        .post('/api/v1/ops/reports/refunds/run')
        .set(auth(scoped))
        .send({})
        .expect(201);
    });

    it('organisation-wide reports are refused to a scoped actor instead of mislabelled', async () => {
      for (const code of ['open_cases', 'data_quality_sweep']) {
        const res = await request(server)
          .post(`/api/v1/ops/reports/${code}/run`)
          .set(auth(scoped))
          .send({})
          .expect(403);
        expect(res.body.title).toMatch(/whole organisation/i);
      }
    });

    it('the dashboard withholds organisation-wide finance numbers from a scoped actor', async () => {
      const scopedDash = await get('/api/v1/ops/dashboard', scoped).expect(200);
      expect(scopedDash.body.financeExceptions).toBeNull();
      expect(scopedDash.body.scopeNote).toBe('Scoped to TST2');
      const adminDash = await get('/api/v1/ops/dashboard', admin).expect(200);
      expect(adminDash.body.financeExceptions).not.toBeNull();
    });
  });

  describe('organisation-wide areas', () => {
    it.each([
      ['GET', '/api/v1/ops/audit'],
      ['GET', '/api/v1/ops/data-quality'],
      ['GET', '/api/v1/ops/cases'],
      ['GET', '/api/v1/ops/payments/reconciliation'],
      ['GET', '/api/v1/ops/payments/config'],
      ['GET', '/api/v1/ops/config/versions?kind=policy'],
      ['GET', '/api/v1/ops/organization/legal'],
    ])('%s %s is refused to a scoped actor and open to an org-wide one', async (_m, path) => {
      const denied = await get(path, scoped).expect(403);
      expect(denied.body.title).toMatch(/whole organisation/i);
      const ok = await get(path, admin);
      expect(ok.status).toBeLessThan(400);
    });

    it('a scoped actor cannot create or archive locations', async () => {
      await request(server)
        .post('/api/v1/ops/locations')
        .set(auth(scoped))
        .send({ code: 'NOPE1', name: 'Nope', timezone: 'UTC' })
        .expect(403);
      await request(server)
        .post('/api/v1/ops/locations/TST2/archive')
        .set(auth(scoped))
        .expect(403);
    });

    it('the locations list and detail are limited to the actor’s branches', async () => {
      const list = await get('/api/v1/ops/locations', scoped).expect(200);
      expect(list.body.map((l: { code: string }) => l.code)).toEqual(['TST2']);
      await get('/api/v1/ops/locations/TST1', scoped).expect(403);
      await get('/api/v1/ops/locations/TST2', scoped).expect(200);
    });
  });

  describe('rate plans and products', () => {
    const plan = (locationCode: string | null) => ({
      categoryCode: 'economy',
      locationCode,
      name: `scope-test-${locationCode ?? 'all'}`,
      effectiveFrom: '2035-01-01',
      baseDayMinor: 5000,
    });

    it('a scoped actor sees their branch’s plans and the org-wide ones, not other branches’', async () => {
      const seed = await request(server)
        .post('/api/v1/ops/pricing/rate-plans')
        .set(auth(admin))
        .send(plan('TST1'))
        .expect(201);
      const res = await get('/api/v1/ops/pricing/rate-plans', scoped).expect(200);
      expect(res.body.some((p: { id: string }) => p.id === seed.body[0].id)).toBe(false);
      expect(
        res.body.every(
          (p: { locationCode: string | null }) =>
            p.locationCode === null || p.locationCode === 'TST2',
        ),
      ).toBe(true);
    });

    it('a scoped actor can write only plans pinned to their own branch', async () => {
      const post = (body: object) =>
        request(server).post('/api/v1/ops/pricing/rate-plans').set(auth(scoped)).send(body);
      await post(plan(null)).expect(403); // org-wide plan
      await post(plan('TST1')).expect(403); // someone else's branch
      const mine = await post(plan('TST2')).expect(201);
      // …and can't hijack an org-wide plan through its id, or delete another branch's
      const orgWide = await request(server)
        .post('/api/v1/ops/pricing/rate-plans')
        .set(auth(admin))
        .send(plan(null))
        .expect(201);
      await post({ ...plan('TST2'), id: orgWide.body[0].id }).expect(403);
      await request(server)
        .delete(`/api/v1/ops/pricing/rate-plans/${orgWide.body[0].id}`)
        .set(auth(scoped))
        .expect(403);
      await request(server)
        .delete(`/api/v1/ops/pricing/rate-plans/${mine.body[0].id}`)
        .set(auth(scoped))
        .expect(200);
    });

    it('products: scoped actors manage only products limited to their own branch', async () => {
      const product = (code: string, locationScope?: string[]) => ({
        code,
        name: code,
        kind: 'extra',
        unitPriceMinor: 500,
        ...(locationScope ? { locationScope } : {}),
      });
      const post = (body: object) =>
        request(server).post('/api/v1/ops/catalogue/products').set(auth(scoped)).send(body);
      await post(product('ls_everywhere')).expect(403);
      await post(product('ls_other', ['TST1'])).expect(403);
      await post(product('ls_mixed', ['TST1', 'TST2'])).expect(403);
      await post(product('ls_mine', ['TST2'])).expect(201);
      await request(server)
        .post('/api/v1/ops/catalogue/products')
        .set(auth(admin))
        .send(product('ls_admin_only'))
        .expect(201);
      const list = await get('/api/v1/ops/catalogue/products', scoped).expect(200);
      const codes = list.body.map((p: { code: string }) => p.code);
      expect(codes).toContain('ls_mine');
      await request(server)
        .post('/api/v1/ops/catalogue/products/ls_admin_only/deactivate')
        .set(auth(scoped))
        .expect(403);
    });
  });

  describe('staff directory', () => {
    it('a scoped manager sees their own branches’ team and themselves, not org-wide accounts', async () => {
      const res = await get('/api/v1/admin/staff', scoped).expect(200);
      const emails = res.body.map((s: { email: string }) => s.email);
      expect(emails).toContain('test-manager@example.test');
      expect(emails).not.toContain('test-admin@example.test');
      const adminRes = await get('/api/v1/admin/staff', admin).expect(200);
      expect(adminRes.body.map((s: { email: string }) => s.email)).toContain(
        'test-admin@example.test',
      );
    });
  });

  describe('archived locations', () => {
    const code = `ARC${Date.now().toString().slice(-6)}`;
    const unit = (n: number) => ({
      categoryCode: 'economy',
      locationCode: code,
      vin: `ARCVIN${code}${n}`.slice(0, 17),
      plate: `ARC-${n}-${code.slice(-3)}`,
    });

    it('archiving reports (and requires confirmation for) cars, staff and pricing tied to the branch', async () => {
      await request(server)
        .post('/api/v1/ops/locations')
        .set(auth(admin))
        .send({ code, name: 'Archive Me', timezone: 'UTC', status: 'active' })
        .expect(201);
      await request(server)
        .post('/api/v1/ops/fleet/units')
        .set(auth(admin))
        .send(unit(1))
        .expect(201);
      const impact = await get(`/api/v1/ops/locations/${code}/impact`, admin).expect(200);
      expect(impact.body).toMatchObject({ units: 1, staff: 0, ratePlans: 0, products: 0 });
      const refused = await request(server)
        .post(`/api/v1/ops/locations/${code}/archive`)
        .set(auth(admin))
        .expect(422);
      expect(refused.body.params).toMatchObject({ units: 1 });
      await request(server)
        .post(`/api/v1/ops/locations/${code}/archive?force=true`)
        .set(auth(admin))
        .expect(201);
    });

    it('an archived location is still offered (flagged) by the options endpoint', async () => {
      const res = await get('/api/v1/ops/locations/options', admin).expect(200);
      expect(res.body.options.find((l: { code: string }) => l.code === code)?.status).toBe(
        'archived',
      );
    });

    it('cars cannot be created at, moved to, or imported into an archived location', async () => {
      await request(server)
        .post('/api/v1/ops/fleet/units')
        .set(auth(admin))
        .send(unit(2))
        .expect(422);
      const anyUnit = await get('/api/v1/ops/fleet/units?locationCode=TST1', admin);
      const id = anyUnit.body.results.find((u: { state: string }) => u.state === 'available')?.id;
      const moved = await request(server)
        .post(`/api/v1/ops/fleet/units/${id}/transfer`)
        .set(auth(admin))
        .send({ toLocationCode: code });
      expect(moved.status).toBe(422);
    });
  });
});
