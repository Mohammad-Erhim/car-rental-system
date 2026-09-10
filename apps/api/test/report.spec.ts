import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * STAGE-006 — Administration & reporting.
 *  - config versioning: append-only revisions, submit → approve, separation of duties
 *    (the author of a draft may not approve it — FR-ADM-006), publish supersedes the prior
 *    published revision, and the published policy is what the cancellation flow reads.
 *  - an invalid policy payload is refused before it can be drafted.
 *  - reports: whitelisted aggregates, location-scoped rows (FR-RPT-004), CSV export shape,
 *    and permission gating.
 */

/** An ISO instant on the next Tuesday at 14:00 UTC (10:00 New York) at least `daysOut` away —
 *  inside TST2's 06:00–20:00 window and never a Sunday, for both pickup and a +2d return. */
function tuesday(daysOut: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysOut);
  d.setUTCHours(14, 0, 0, 0);
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}
const plus = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};

async function book(
  server: ReturnType<typeof httpServer>,
  token: string,
  opts: { pickupLocationCode: string; categoryCode: string; pickupAt: string; returnAt: string },
) {
  const quote = await request(server)
    .post('/api/v1/discovery/quote')
    .send({ ...opts, holderKey: `rpt-${Math.random().toString(36).slice(2)}` })
    .expect(201);
  const res = await request(server)
    .post('/api/v1/bookings/confirm')
    .set('Authorization', `Bearer ${token}`)
    .send({
      quoteReference: quote.body.reference,
      drivers: [{ role: 'primary_renter', fullName: 'Rhea Report', email: 'rhea@example.test' }],
      acceptTerms: true,
      paymentToken: 'tok_ok',
    })
    .expect(201);
  return res.body.reference as string;
}

describe('STAGE-006 administration & reporting', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let managerToken: string;
  let scopedToken: string;
  let agentToken: string;
  let customerToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    managerToken = (await signIn(app, 'test-manager@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    scopedToken = (await signIn(app, 'test-scoped@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    customerToken = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;
  });
  afterAll(closeTestApp);

  it('TEST-ADM-001 config versioning: submit → approve; the author cannot approve their own draft', async () => {
    // draft a new cancellation policy
    const draft = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kind: 'policy',
        key: 'cancellation',
        payload: { freeCancelHours: 24, lateFeeBps: 3000 },
        note: 'tighten free-cancel window',
      })
      .expect(201);
    expect(draft.body.state).toBe('draft');
    expect(draft.body.revision).toBe(1);
    const id = draft.body.id as string;

    // preview is a pure projection — no state change
    const preview = await request(server)
      .post('/api/v1/ops/config/versions/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'policy', payload: { freeCancelHours: 24, lateFeeBps: 3000 } })
      .expect(201);
    expect(Array.isArray(preview.body.examples)).toBe(true);
    expect(preview.body.examples.join(' ')).toContain('24h');

    // with a key named, the projection is scoped to that key's effect only
    const scoped = await request(server)
      .post('/api/v1/ops/config/versions/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kind: 'policy',
        key: 'cancellation',
        payload: { freeCancelHours: 24, lateFeeBps: 3000 },
      })
      .expect(201);
    expect(scoped.body.examples).toHaveLength(1);
    expect(scoped.body.examples[0]).toContain('24h');

    // submit for review
    const submitted = await request(server)
      .post(`/api/v1/ops/config/versions/${id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    expect(submitted.body.state).toBe('in_review');

    // the author may not approve their own change (FR-ADM-006 separation of duties)
    const selfApprove = await request(server)
      .post(`/api/v1/ops/config/versions/${id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(403);
    expect(selfApprove.body.code).toBe('approval_required');
    expect(selfApprove.body.params?.reason).toBe('author_cannot_approve');

    // a different publisher approves → published, with a distinct approver
    const approved = await request(server)
      .post(`/api/v1/ops/config/versions/${id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    expect(approved.body.state).toBe('published');
    expect(approved.body.approvedBy).toBeTruthy();
    expect(approved.body.approvedBy).not.toBe(approved.body.createdBy);
    expect(approved.body.effectiveFrom).toBeTruthy();
  });

  it('TEST-ADM-002 a new published revision supersedes the prior one, and the cancel flow reads it', async () => {
    // revision 2: a very wide late-fee window (any booking < ~42 days out is charged) at 10%
    const draft = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kind: 'policy',
        key: 'cancellation',
        payload: { freeCancelHours: 1000, lateFeeBps: 1000 },
        note: 'wide late-fee window, 10% fee',
      })
      .expect(201);
    expect(draft.body.revision).toBe(2);
    await request(server)
      .post(`/api/v1/ops/config/versions/${draft.body.id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    await request(server)
      .post(`/api/v1/ops/config/versions/${draft.body.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);

    const list = await request(server)
      .get('/api/v1/ops/config/versions?kind=policy&key=cancellation')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const byRev = Object.fromEntries(
      (list.body as Array<{ revision: number; state: string }>).map((r) => [r.revision, r.state]),
    );
    expect(byRev[1]).toBe('superseded');
    expect(byRev[2]).toBe('published');

    // a booking ~20 days out sits inside the 1000h late-fee window → charged the published 10%
    const pickupAt = tuesday(20);
    const ref = await book(server, customerToken, {
      pickupLocationCode: 'TST1',
      categoryCode: 'compact',
      pickupAt,
      returnAt: plus(pickupAt, 3),
    });
    const detail = await request(server)
      .get(`/api/v1/reservations/${ref}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const totalMinor = detail.body.totalMinor as number;

    const cancelled = await request(server)
      .post(`/api/v1/reservations/${ref}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reasonCode: 'plans_changed' })
      .expect(201);
    expect(cancelled.body.feeMinor).toBe(Math.round((totalMinor * 1000) / 10_000));
  });

  it('TEST-ADM-003 an invalid policy payload is refused before it is drafted', async () => {
    await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kind: 'policy',
        key: 'cancellation',
        payload: { freeCancelHours: 24, lateFeeBps: 20000 },
      })
      .expect(422);
    await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kind: 'policy',
        key: 'cancellation',
        payload: { freeCancelHours: -4, lateFeeBps: 0 },
      })
      .expect(422);

    // a typo'd field name would previously be persisted and silently ignored — now it is rejected
    const typo = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kind: 'policy',
        key: 'cancellation',
        payload: { freeCancelHours: 24, lateFeeBps: 2000, freeCancelHoursTypo: 12 },
      })
      .expect(422);
    expect(typo.body.fieldErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'freeCancelHoursTypo', code: 'unknown_field' }),
      ]),
    );

    // a missing required field is rejected too (a blank input must not become an implicit 0)
    const missing = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'policy', key: 'cancellation', payload: { freeCancelHours: 24 } })
      .expect(422);
    expect(missing.body.fieldErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'lateFeeBps', code: 'required' })]),
    );

    // an unknown policy key is rejected
    await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'policy', key: 'made_up_policy', payload: { foo: 1 } })
      .expect(422);
  });

  it('TEST-ADM-004 rejecting a draft keeps the author note and records the reviewer reason', async () => {
    const draft = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kind: 'policy',
        key: 'fuel_rate',
        payload: { minorPerPct: 500 },
        note: 'bump the refuel rate',
      })
      .expect(201);
    await request(server)
      .post(`/api/v1/ops/config/versions/${draft.body.id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    // a reject with no reason is refused
    await request(server)
      .post(`/api/v1/ops/config/versions/${draft.body.id}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(422);

    const rejected = await request(server)
      .post(`/api/v1/ops/config/versions/${draft.body.id}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ note: 'too aggressive for Q3' })
      .expect(201);
    expect(rejected.body.state).toBe('rejected');
    expect(rejected.body.note).toContain('bump the refuel rate');
    expect(rejected.body.note).toContain('too aggressive for Q3');
  });

  it('TEST-RPT-001 report rows respect the operator location scope (FR-RPT-004)', async () => {
    const p1 = tuesday(30);
    const p2 = tuesday(40);
    await book(server, customerToken, {
      pickupLocationCode: 'TST1',
      categoryCode: 'economy',
      pickupAt: p1,
      returnAt: plus(p1, 2),
    });
    await book(server, customerToken, {
      pickupLocationCode: 'TST2',
      categoryCode: 'economy',
      pickupAt: p2,
      returnAt: plus(p2, 2),
    });

    const scoped = await request(server)
      .post('/api/v1/ops/reports/reservations_by_state/run')
      .set('Authorization', `Bearer ${scopedToken}`)
      .send({})
      .expect(201);
    expect(scoped.body.scopeNote).toBe('Scoped to TST1');
    const scopedTotal = (scoped.body.rows as Array<{ count: number }>).reduce(
      (s, r) => s + r.count,
      0,
    );

    const unscoped = await request(server)
      .post('/api/v1/ops/reports/reservations_by_state/run')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    expect(unscoped.body.scopeNote).toBe('All locations');
    const unscopedTotal = (unscoped.body.rows as Array<{ count: number }>).reduce(
      (s, r) => s + r.count,
      0,
    );

    // the TST2 booking is visible to the org-wide operator but not to the TST1-scoped one
    expect(unscopedTotal).toBeGreaterThan(scopedTotal);
    expect(scopedTotal).toBeGreaterThanOrEqual(1);
  });

  it('TEST-RPT-002 a report run exports as CSV with a header row', async () => {
    const run = await request(server)
      .post('/api/v1/ops/reports/fleet_utilisation/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    expect(run.body.rowCount).toBeGreaterThanOrEqual(1);

    const csv = await request(server)
      .get(`/api/v1/ops/reports/runs/${run.body.runId}/export`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = (csv.text as string).trim().split('\n');
    expect(lines[0]).toBe('state,units');
    expect(lines.length).toBe(run.body.rowCount + 1);
  });

  it('TEST-RPT-003 report endpoints require the report.read permission', async () => {
    await request(server)
      .get('/api/v1/ops/reports')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(403);
    await request(server)
      .post('/api/v1/ops/reports/fleet_utilisation/run')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({})
      .expect(403);
    // open_cases needs the stronger audit.read — finance/report.read alone is not enough
    await request(server)
      .post('/api/v1/ops/reports/open_cases/run')
      .set('Authorization', `Bearer ${scopedToken}`)
      .send({})
      .expect(403);
  });

  it('TEST-ADM-004 the audit trail records the config workflow with actor attribution', async () => {
    const audit = await request(server)
      .get('/api/v1/ops/audit?targetType=config_version')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const actions = (audit.body as Array<{ action: string }>).map((r) => r.action);
    expect(actions).toContain('config.version.drafted');
    expect(actions).toContain('config.version.submitted');
    expect(actions).toContain('config.version.approved');
  });

  it('TEST-ADM-006 sending a schedule needs a fresh step-up, then re-checks the owner and pauses if they lost access', async () => {
    // a helper: STEP_UP_MAX_AGE_SEC is 1s in tests, so re-confirm right before each send
    const stepUp = () =>
      request(server)
        .post('/api/v1/auth/step-up')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'Test-Passw0rd!' })
        .expect(201);

    // scoped finance staff owns the schedule (they hold report.export)
    const created = await request(server)
      .post('/api/v1/ops/reports/schedules')
      .set('Authorization', `Bearer ${scopedToken}`)
      .send({
        definitionCode: 'fleet_utilisation',
        cron: '0 7 * * 1',
        recipients: ['ops@example.test'],
      })
      .expect(201);
    const scheduleId = created.body.id as string;

    // let the sign-in from `beforeAll` age past STEP_UP_MAX_AGE_SEC (1s in tests) so the first
    // send is genuinely stale — otherwise a fast run reaches here inside the window and the
    // guard (correctly) lets it through.
    await new Promise((r) => setTimeout(r, 1200));

    // without a recent step-up the send is refused
    const stale = await request(server)
      .post(`/api/v1/ops/reports/schedules/${scheduleId}/send`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(401);
    expect(stale.body.code).toBe('auth_step_up_required');

    // a wrong password does not grant the step-up
    await request(server)
      .post('/api/v1/auth/step-up')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'not-the-password' })
      .expect(422);

    // unknown id → 404 (after a valid step-up)
    await stepUp();
    await request(server)
      .post('/api/v1/ops/reports/schedules/00000000-0000-0000-0000-000000000000/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    // owner still authorised → sent
    await stepUp();
    const sent = await request(server)
      .post(`/api/v1/ops/reports/schedules/${scheduleId}/send`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(sent.body).toMatchObject({ sent: true, recipients: ['ops@example.test'] });
    expect(typeof sent.body.runId).toBe('string');

    // offboard the owner
    const staff = await request(server)
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const owner = (staff.body as Array<{ accountId: string; email: string }>).find(
      (s) => s.email === 'test-scoped@example.test',
    );
    expect(owner).toBeTruthy();
    await request(server)
      .post(`/api/v1/admin/staff/${owner!.accountId}/access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'suspended' })
      .expect(201);

    // now the send is skipped and the schedule is paused with a recorded reason
    await stepUp();
    const skipped = await request(server)
      .post(`/api/v1/ops/reports/schedules/${scheduleId}/send`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(skipped.body).toMatchObject({ sent: false, reason: 'owner_not_authorized' });

    const schedules = await request(server)
      .get('/api/v1/ops/reports/schedules')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = (
      schedules.body as Array<{ id: string; isActive: string; lastSkipReason: string }>
    ).find((s) => s.id === scheduleId);
    expect(row).toMatchObject({ isActive: 'false', lastSkipReason: 'owner_not_authorized' });

    // an agent without report.export cannot trigger a send
    await request(server)
      .post(`/api/v1/ops/reports/schedules/${scheduleId}/send`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(403);
  });

  it('TEST-ADM-005 the data-quality panel runs its referential-integrity checks; agents are refused', async () => {
    const res = await request(server)
      .get('/api/v1/ops/data-quality')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(typeof res.body.checkedAt).toBe('string');
    expect(typeof res.body.ok).toBe('boolean');
    const checks = res.body.checks as Array<{
      id: string;
      count: number;
      ok: boolean;
      severity: string;
      sample: string[];
    }>;
    expect(checks.length).toBeGreaterThanOrEqual(5);
    for (const c of checks) {
      expect(typeof c.count).toBe('number');
      expect(c.ok).toBe(c.count === 0);
      expect(Array.isArray(c.sample)).toBe(true);
    }
    // the referential-integrity checks stay clean — no test creates orphans or dangling rows
    const countFor = (id: string) => checks.find((c) => c.id === id)?.count;
    expect(countFor('rental_active_without_unit')).toBe(0);
    expect(countFor('unit_orphan_location')).toBe(0);
    expect(countFor('lookup_value_dangling_type')).toBe(0);
    expect(countFor('reservation_orphan_account')).toBe(0);

    await request(server)
      .get('/api/v1/ops/data-quality')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(403);
  });

  it('SCREEN-OPS-002 the operational dashboard returns scoped counts, never below zero; a customer is refused', async () => {
    const res = await request(server)
      .get('/api/v1/ops/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const b = res.body as {
      checkedAt: string;
      scopeNote: string;
      pickupsToday: { total: number; done: number };
      returnsToday: { total: number; done: number };
      overdue: number;
      assignQueue: number;
      cancellationsToday: number;
      revenueToday: { minor: number; currency: string };
      financeExceptions: { recoveryCases: number; reconciliation: number; total: number };
      fleet: {
        available: number;
        on_rent: number;
        prep: number;
        maintenance: number;
        other: number;
      };
      fleetTotal: number;
      utilisation: number | null;
    };
    expect(typeof b.checkedAt).toBe('string');
    expect(b.scopeNote).toBe('All locations');
    for (const n of [
      b.pickupsToday.total,
      b.pickupsToday.done,
      b.returnsToday.total,
      b.returnsToday.done,
      b.overdue,
      b.assignQueue,
      b.cancellationsToday,
      b.financeExceptions.total,
      b.fleet.available,
      b.fleet.on_rent,
    ]) {
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
    expect(typeof b.revenueToday.currency).toBe('string');
    expect(Number.isInteger(b.revenueToday.minor)).toBe(true);
    // done never exceeds total
    expect(b.pickupsToday.done).toBeLessThanOrEqual(b.pickupsToday.total);
    expect(b.returnsToday.done).toBeLessThanOrEqual(b.returnsToday.total);
    // total == its parts
    expect(b.financeExceptions.total).toBe(
      b.financeExceptions.recoveryCases + b.financeExceptions.reconciliation,
    );
    // the fixture seeds a fleet, so the readiness breakdown is populated
    const fleetSum =
      b.fleet.available + b.fleet.on_rent + b.fleet.prep + b.fleet.maintenance + b.fleet.other;
    expect(fleetSum).toBeGreaterThan(0);
    expect(b.fleetTotal).toBe(fleetSum);
    // utilisation is a 0..100 percentage derived from the fleet (never null once units exist)
    expect(b.utilisation).not.toBeNull();
    expect(b.utilisation).toBeGreaterThanOrEqual(0);
    expect(b.utilisation).toBeLessThanOrEqual(100);

    // FR-RPT-004 — the rental/reservation counts run through `scopeCodes(actor)` (the same
    // location-scope filter proven by TEST-RPT-001); an org-wide actor gets "All locations".

    // a customer has no ops permissions
    await request(server)
      .get('/api/v1/ops/dashboard')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
  });
});
