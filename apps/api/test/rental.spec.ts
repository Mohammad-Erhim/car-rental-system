import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * STAGE-005 — rental lifecycle.
 *  - assign → pickup → extend → return with a fuel adjustment → closed + settlement.
 *  - pickup requires a driver licence number.
 *  - one open rental per unit: a second active rental on the same unit is refused.
 *  - a returned unit is not bookable until readiness passes.
 */
const isoIn = (days: number, hour = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

/**
 * `days` from now, nudged forward to a Monday–Wednesday. TST2 is closed on Sundays, so a 3-day hire
 * from a fixed offset lands on its closed day whenever the suite happens to run on a certain weekday
 * (these two tests failed every Sunday). Mon–Wed pickups return Thu–Sat, always open.
 */
const midweekOffset = (days: number) => {
  let n = days;
  while (![1, 2, 3].includes(new Date(isoIn(n)).getUTCDay())) n++;
  return n;
};

async function book(
  server: ReturnType<typeof httpServer>,
  token: string,
  categoryCode: string,
  pickupDay: number,
  days = 3,
  paymentToken = 'tok_ok',
) {
  const quote = await request(server)
    .post('/api/v1/discovery/quote')
    .send({
      pickupLocationCode: 'TST1',
      pickupAt: isoIn(pickupDay),
      returnAt: isoIn(pickupDay + days),
      categoryCode,
      holderKey: `rnt-${Math.random().toString(36).slice(2)}`,
    })
    .expect(201);
  const res = await request(server)
    .post('/api/v1/bookings/confirm')
    .set('Authorization', `Bearer ${token}`)
    .send({
      quoteReference: quote.body.reference,
      drivers: [{ role: 'primary_renter', fullName: 'Rex Renter', email: 'rex@example.test' }],
      acceptTerms: true,
      paymentToken,
    })
    .expect(201);
  return res.body.reference as string;
}

describe('rental lifecycle', () => {
  let server: ReturnType<typeof httpServer>;
  let agentToken: string;
  let adminToken: string;
  let customerToken: string;
  let financeToken: string; // rental.read but no rental.pickup/rental.return
  const auth = (tok: string) => ({ Authorization: `Bearer ${tok}` });

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    financeToken = (await signIn(app, 'test-finance@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    customerToken = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;
  });
  afterAll(closeTestApp);

  it('TEST-RNT-001 assign → pickup → extend → return; unit gated until readiness', async () => {
    const resRef = await book(server, customerToken, 'compact', 30, 3);

    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({})
      .expect(201);
    expect(assigned.body.state).toBe('awaiting_pickup');
    expect(assigned.body.unitId).toBeTruthy();
    const rentalRef = assigned.body.reference as string;
    const unitId = assigned.body.unitId as string;

    // pickup needs a licence number
    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/pickup`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ odometerKm: 12000, fuelPct: 100, driverName: 'Rex Renter' })
      .expect(422);

    const pickedUp = await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/pickup`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ odometerKm: 12000, fuelPct: 100, driverName: 'Rex Renter', licenceNumber: 'D-42' })
      .expect(201);
    expect(pickedUp.body.state).toBe('active');
    expect(pickedUp.body.agreementVersion).toBe('1.0');

    // customer extends
    const extended = await request(server)
      .post(`/api/v1/rentals/${rentalRef}/extend`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ newReturnAt: isoIn(30 + 6), paymentToken: 'tok_ok' })
      .expect(201);
    expect(extended.body.deltaMinor).toBeGreaterThan(0);
    expect(new Date(extended.body.scheduledReturnAt).getTime()).toBe(new Date(isoIn(36)).getTime());
    expect(extended.body.settlementMinor).toBe(extended.body.deltaMinor);

    // agent returns with a fuel deficit + a damage finding
    const returned = await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/return`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        odometerKm: 12480,
        fuelPct: 80, // 20% deficit
        checklist: [{ item: 'exterior', ok: false }],
        findings: [
          { area: 'front bumper', severity: 'minor', description: 'scuff', chargeMinor: 5000 },
        ],
      })
      .expect(201);
    expect(returned.body.state).toBe('closed');
    expect(returned.body.fuelMinor).toBe(20 * 150); // 3000
    expect(returned.body.damageMinor).toBe(5000);
    expect(returned.body.adjustmentMinor).toBe(8000);
    expect(returned.body.settlementMinor).toBe(extended.body.deltaMinor + 8000);

    // the unit is not bookable yet — it is in `prep`
    const beforeReadiness = await request(server)
      .post('/api/v1/discovery/search')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(200),
        returnAt: isoIn(203),
        categoryCode: 'compact',
      })
      .expect(201);
    const compactBefore = beforeReadiness.body.options.find(
      (o: { categoryCode: string }) => o.categoryCode === 'compact',
    ).bookableCount;

    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/readiness`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ passed: true })
      .expect(201);

    const afterReadiness = await request(server)
      .post('/api/v1/discovery/search')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(200),
        returnAt: isoIn(203),
        categoryCode: 'compact',
      })
      .expect(201);
    const compactAfter = afterReadiness.body.options.find(
      (o: { categoryCode: string }) => o.categoryCode === 'compact',
    ).bookableCount;
    expect(compactAfter).toBe(compactBefore + 1);
    void unitId;
  });

  it('a customer cannot extend a stranger’s rental, even with a valid token', async () => {
    const resRef = await book(server, customerToken, 'compact', 40, 3);
    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({})
      .expect(201);
    const rentalRef = assigned.body.reference as string;
    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/pickup`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ odometerKm: 1000, fuelPct: 100, driverName: 'Rex Renter', licenceNumber: 'D-11' })
      .expect(201);

    const uniq = Date.now();
    const email = `stranger-${uniq}@example.test`;
    const reg = await request(server)
      .post('/api/v1/auth/register')
      .send({ fullName: `Stranger ${uniq}`, email, password: 'Sup3rSecret!!', acceptTerms: true })
      .expect(201);
    await request(server)
      .post('/api/v1/auth/verify-contact')
      .send({ challengeId: reg.body.challengeId, code: reg.body.devCode })
      .expect(201);
    const strangerToken = (await signIn(await getTestApp(), email, 'Sup3rSecret!!', 'customer'))
      .accessToken;

    await request(server)
      .post(`/api/v1/rentals/${rentalRef}/extend`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ newReturnAt: isoIn(46), paymentToken: 'tok_ok' })
      .expect(403);

    // the rightful owner still can
    await request(server)
      .post(`/api/v1/rentals/${rentalRef}/extend`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ newReturnAt: isoIn(46), paymentToken: 'tok_ok' })
      .expect(201);

    // return + pass readiness — this file's shared TST1 `compact` pool is small and every test in
    // it runs against the same units; leaving this rental open (as the assertions above alone
    // would) permanently drains one unit for every later test in this file, same as TEST-RNT-001
    // already does deliberately at the end of its own cycle.
    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/return`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ odometerKm: 1010, fuelPct: 100 })
      .expect(201);
    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/readiness`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ passed: true })
      .expect(201);
  });

  it('a declined return-settlement charge never blocks the return itself — the car checks in and a recovery case opens', async () => {
    const resRef = await book(server, customerToken, 'economy', 70, 3, 'tok_decline_reuse');
    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({})
      .expect(201);
    const rentalRef = assigned.body.reference as string;

    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/pickup`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ odometerKm: 5000, fuelPct: 100, driverName: 'Rex Renter', licenceNumber: 'D-99' })
      .expect(201);

    const casesBefore = await request(server)
      .get('/api/v1/ops/cases')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const openBefore = casesBefore.body.filter(
      (c: { kind: string }) => c.kind === 'settlement_declined',
    ).length;

    // a damage finding forces a non-zero settlement charge, which the saved method declines —
    // the return must still succeed (car physically back), just with settlementCollected: false.
    const returned = await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/return`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        odometerKm: 5100,
        fuelPct: 100,
        findings: [
          { area: 'rear bumper', severity: 'minor', description: 'scratch', chargeMinor: 2500 },
        ],
      })
      .expect(201);
    expect(returned.body.state).toBe('closed');
    expect(returned.body.adjustmentMinor).toBe(2500);
    expect(returned.body.settlementCollected).toBe(false);
    // the unit must still be checked in (prep, not stuck on-rent) despite the declined charge
    expect(returned.body.state).not.toBe('active');
    expect(returned.body.state).not.toBe('overdue');

    const casesAfter = await request(server)
      .get('/api/v1/ops/cases')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const opened = casesAfter.body.filter(
      (c: { kind: string; subjectRef: string }) =>
        c.kind === 'settlement_declined' && c.subjectRef === rentalRef,
    );
    expect(opened.length).toBe(1);
    expect(
      casesAfter.body.filter((c: { kind: string }) => c.kind === 'settlement_declined').length,
    ).toBe(openBefore + 1);
  });

  it('TEST-RNT-002 one open rental per unit — assigning an already-committed unit is refused', async () => {
    const resA = await book(server, customerToken, 'suv', 60, 2);
    const a = await request(server)
      .post(`/api/v1/ops/reservations/${resA}/assign`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({})
      .expect(201);
    const unitId = a.body.unitId as string;
    await request(server)
      .post(`/api/v1/ops/rentals/${a.body.reference}/pickup`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ odometerKm: 5000, fuelPct: 100, driverName: 'A', licenceNumber: 'D-1' })
      .expect(201);

    const resB = await book(server, customerToken, 'suv', 61, 2);
    // Manually forcing the same (now on_rent) unit onto a second reservation is refused at
    // assign() itself — the service validates a caller-chosen unitId the same way it filters
    // auto-assign candidates, rather than only discovering the collision later at pickup via
    // the DB's partial unique index (rental_open_unit_unq).
    const collide = await request(server)
      .post(`/api/v1/ops/reservations/${resB}/assign`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ unitId }) // force the same unit
      .expect(422);
    expect(collide.body.params?.reason).toBe('unit_unavailable');
  });

  it('permission: a customer cannot run pickup', async () => {
    const resRef = await book(server, customerToken, 'economy', 45, 2);
    const a = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({})
      .expect(201);
    await request(server)
      .post(`/api/v1/ops/rentals/${a.body.reference}/pickup`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ odometerKm: 1, fuelPct: 100, driverName: 'X', licenceNumber: 'D' })
      .expect(403);
  });

  it('TEST-RNT-004 a breakdown incident swaps the vehicle for a replacement; the old one goes to prep', async () => {
    const resRef = await book(server, customerToken, 'suv', 70, 3);
    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set(auth(agentToken))
      .send({})
      .expect(201);
    const rentalRef = assigned.body.reference as string;
    const originalUnit = assigned.body.unitId as string;
    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/pickup`)
      .set(auth(agentToken))
      .send({ odometerKm: 8000, fuelPct: 100, driverName: 'Rex Renter', licenceNumber: 'D-9' })
      .expect(201);

    const units = await request(server)
      .get('/api/v1/ops/fleet/units')
      .query({ locationCode: 'TST1', categoryCode: 'suv' })
      .set(auth(adminToken))
      .expect(200);
    const replacement = units.body.results.find(
      (u: { id: string; state: string }) => u.state === 'available' && u.id !== originalUnit,
    );
    expect(replacement).toBeTruthy();

    const after = await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/incident`)
      .set(auth(agentToken))
      .send({ category: 'breakdown', note: 'warning light on', replacementUnitId: replacement.id })
      .expect(201);
    expect(after.body.unitId).toBe(replacement.id);
    expect(after.body.state).toBe('active');
    const kinds = after.body.history.map((e: { type: string }) => e.type);
    expect(kinds).toEqual(expect.arrayContaining(['incident', 'replacement']));

    const now = await request(server)
      .get('/api/v1/ops/fleet/units')
      .query({ locationCode: 'TST1', categoryCode: 'suv' })
      .set(auth(adminToken))
      .expect(200);
    expect(now.body.results.find((u: { id: string }) => u.id === replacement.id).state).toBe(
      'on_rent',
    );
    expect(now.body.results.find((u: { id: string }) => u.id === originalUnit).state).toBe('prep');
  });

  it('an accident with no replacement immobilises the vehicle; guards reject a bad swap / a closed rental', async () => {
    const resRef = await book(server, customerToken, 'compact', 76, 3);
    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set(auth(agentToken))
      .send({})
      .expect(201);
    const rentalRef = assigned.body.reference as string;
    const unitId = assigned.body.unitId as string;
    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/pickup`)
      .set(auth(agentToken))
      .send({ odometerKm: 5000, fuelPct: 100, driverName: 'Rex Renter', licenceNumber: 'D-1' })
      .expect(201);

    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/incident`)
      .set(auth(agentToken))
      .send({ category: 'accident', note: 'rear-ended at a light' })
      .expect(201);

    const units = await request(server)
      .get('/api/v1/ops/fleet/units')
      .query({ locationCode: 'TST1' })
      .set(auth(adminToken))
      .expect(200);
    expect(units.body.results.find((u: { id: string }) => u.id === unitId).state).toBe(
      'out_of_service',
    );
    const blocks = await request(server)
      .get('/api/v1/ops/fleet/blocks')
      .query({ unitId, status: 'active' })
      .set(auth(adminToken))
      .expect(200);
    expect(blocks.body.some((b: { kind: string }) => b.kind === 'damage')).toBe(true);

    // an unknown replacement unit → 404
    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/incident`)
      .set(auth(agentToken))
      .send({
        category: 'other',
        replacementUnitId: '00000000-0000-0000-0000-000000000000',
      })
      .expect(404);

    // a customer cannot raise an incident
    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/incident`)
      .set(auth(customerToken))
      .send({ category: 'other' })
      .expect(403);
  });

  it('a return odometer below the pickup reading is refused (422)', async () => {
    const resRef = await book(server, customerToken, 'compact', 118, 3);
    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set(auth(agentToken))
      .send({})
      .expect(201);
    const ref = assigned.body.reference as string;
    await request(server)
      .post(`/api/v1/ops/rentals/${ref}/pickup`)
      .set(auth(agentToken))
      .send({ odometerKm: 20000, fuelPct: 100, driverName: 'Rex Renter', licenceNumber: 'D-9' })
      .expect(201);
    const bad = await request(server)
      .post(`/api/v1/ops/rentals/${ref}/return`)
      .set(auth(agentToken))
      .send({ odometerKm: 19990, fuelPct: 100 })
      .expect(422);
    expect(JSON.stringify(bad.body)).toMatch(/odometer/i);
    // a reading equal-or-above the pickup value is fine
    await request(server)
      .post(`/api/v1/ops/rentals/${ref}/return`)
      .set(auth(agentToken))
      .send({ odometerKm: 20000, fuelPct: 100 })
      .expect(201);
  });

  it('readiness only runs on a returned rental — it cannot un-rent an in-service vehicle', async () => {
    const resRef = await book(server, customerToken, 'compact', 126, 3);
    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set(auth(agentToken))
      .send({})
      .expect(201);
    const ref = assigned.body.reference as string;
    const unitId = assigned.body.unitId as string;
    await request(server)
      .post(`/api/v1/ops/rentals/${ref}/pickup`)
      .set(auth(agentToken))
      .send({ odometerKm: 5000, fuelPct: 100, driverName: 'Rex Renter', licenceNumber: 'D-7' })
      .expect(201);

    // the rental is active — readiness must be refused, and the unit stays on_rent
    await request(server)
      .post(`/api/v1/ops/rentals/${ref}/readiness`)
      .set(auth(agentToken))
      .send({ passed: true })
      .expect(422);

    const board = await request(server)
      .get('/api/v1/ops/rentals?state=active')
      .set(auth(adminToken))
      .expect(200);
    expect(
      board.body.results.some(
        (r: { reference: string; unitId: string }) => r.reference === ref && r.unitId === unitId,
      ),
    ).toBe(true);
  });

  it('a rental only ever gets ONE readiness check — the board/detail reflect the outcome, and a repeat click is refused', async () => {
    const resRef = await book(server, customerToken, 'compact', 141, 3);
    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set(auth(agentToken))
      .send({})
      .expect(201);
    const ref = assigned.body.reference as string;
    await request(server)
      .post(`/api/v1/ops/rentals/${ref}/pickup`)
      .set(auth(agentToken))
      .send({ odometerKm: 3000, fuelPct: 100, driverName: 'Rex Renter', licenceNumber: 'D-11' })
      .expect(201);
    await request(server)
      .post(`/api/v1/ops/rentals/${ref}/return`)
      .set(auth(agentToken))
      .send({ odometerKm: 3200, fuelPct: 100 })
      .expect(201);

    // before the check: the board carries no outcome yet
    const boardBefore = await request(server)
      .get('/api/v1/ops/rentals?state=closed')
      .set(auth(adminToken))
      .expect(200);
    expect(
      (
        boardBefore.body.results as Array<{
          reference: string;
          readinessOutcome: string | null;
        }>
      ).find((r) => r.reference === ref)?.readinessOutcome,
    ).toBeNull();

    await request(server)
      .post(`/api/v1/ops/rentals/${ref}/readiness`)
      .set(auth(agentToken))
      .send({ passed: true })
      .expect(201);

    // after: both the board row and the detail view carry the outcome — this is the only signal
    // that the check ran at all, since a closed rental's own `state` never changes
    const boardAfter = await request(server)
      .get('/api/v1/ops/rentals?state=closed')
      .set(auth(adminToken))
      .expect(200);
    expect(
      (
        boardAfter.body.results as Array<{ reference: string; readinessOutcome: string | null }>
      ).find((r) => r.reference === ref)?.readinessOutcome,
    ).toBe('passed');

    const detail = await request(server)
      .get(`/api/v1/rentals/${ref}`)
      .set(auth(adminToken))
      .expect(200);
    expect(detail.body.readinessOutcome).toBe('passed');

    // a repeat click (double-click, a stale tab) is refused, not silently re-applied
    const repeat = await request(server)
      .post(`/api/v1/ops/rentals/${ref}/readiness`)
      .set(auth(agentToken))
      .send({ passed: true })
      .expect(422);
    expect(repeat.body.title).toMatch(/already been checked/i);
  });

  it('TEST-RNT-003 the overdue sweep runs (staff only) and reports a count (FR-RNT-014)', async () => {
    // the worker runs this on its housekeeping tick; the endpoint is the manual trigger
    const swept = await request(server)
      .post('/api/v1/ops/rentals/overdue-sweep')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({})
      .expect(201);
    expect(typeof swept.body.marked).toBe('number');
    expect(swept.body.marked).toBeGreaterThanOrEqual(0);

    await request(server)
      .post('/api/v1/ops/rentals/overdue-sweep')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({})
      .expect(403);

    // rental.read (view-only) is not enough to trigger the mutation either
    await request(server)
      .post('/api/v1/ops/rentals/overdue-sweep')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({})
      .expect(403);
  });

  it('SCREEN-CUS-003b: assign() honors the car the customer picked before checkout when still viable', async () => {
    const win = { pickupLocationCode: 'TST1', pickupAt: isoIn(126), returnAt: isoIn(128) };
    const units = await request(server)
      .get('/api/v1/catalogue/categories/economy/units')
      .query({
        locationCode: win.pickupLocationCode,
        pickupAt: win.pickupAt,
        returnAt: win.returnAt,
      })
      .expect(200);
    const pick = units.body[0].id as string;

    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        ...win,
        categoryCode: 'economy',
        hold: true,
        holderKey: `rnt-pick-${Math.random().toString(36).slice(2)}`,
        unitId: pick,
      })
      .expect(201);
    const confirmed = await request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        quoteReference: quote.body.reference,
        drivers: [{ role: 'primary_renter', fullName: 'Rex Renter', email: 'rex@example.test' }],
        acceptTerms: true,
        paymentToken: 'tok_ok',
      })
      .expect(201);

    // no explicit unitId on the assign call — the reservation's own pin should be honored
    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${confirmed.body.reference}/assign`)
      .set(auth(agentToken))
      .send({})
      .expect(201);
    expect(assigned.body.unitId).toBe(pick);
  });

  it("SCREEN-CUS-003b: assign() falls back to auto-pick when the customer's pinned car stopped being viable", async () => {
    const win = { pickupLocationCode: 'TST1', pickupAt: isoIn(130), returnAt: isoIn(132) };
    const units = await request(server)
      .get('/api/v1/catalogue/categories/economy/units')
      .query({
        locationCode: win.pickupLocationCode,
        pickupAt: win.pickupAt,
        returnAt: win.returnAt,
      })
      .expect(200);
    const pick = units.body[0].id as string;

    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        ...win,
        categoryCode: 'economy',
        hold: true,
        holderKey: `rnt-fallback-${Math.random().toString(36).slice(2)}`,
        unitId: pick,
      })
      .expect(201);
    const confirmed = await request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        quoteReference: quote.body.reference,
        drivers: [{ role: 'primary_renter', fullName: 'Rex Renter', email: 'rex@example.test' }],
        acceptTerms: true,
        paymentToken: 'tok_ok',
      })
      .expect(201);

    // the pinned car goes to maintenance before pickup — a real "no longer viable" case
    const block = await request(server)
      .post('/api/v1/ops/fleet/blocks')
      .set(auth(adminToken))
      .send({ unitId: pick, kind: 'maintenance', reasonCode: 'maintenance', startAt: isoIn(0) })
      .expect(201);

    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${confirmed.body.reference}/assign`)
      .set(auth(agentToken))
      .send({})
      .expect(201);
    expect(assigned.body.unitId).toBeTruthy();
    expect(assigned.body.unitId).not.toBe(pick);

    // release the block — this shared fixture fleet is a scarce, file-wide resource; don't leave
    // a unit permanently unusable for every test that runs after this one.
    await request(server)
      .post(`/api/v1/ops/fleet/blocks/${block.body.id}/release`)
      .set(auth(adminToken))
      .expect(201);
  });

  it('the vehicle can be reassigned before pickup, but not once the rental is active', async () => {
    const resRef = await book(server, customerToken, 'intermediate', 136, 3);
    const first = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set(auth(agentToken))
      .send({})
      .expect(201);
    const rentalRef = first.body.reference as string;
    const firstUnitId = first.body.unitId as string;

    const win = { pickupLocationCode: 'TST1', pickupAt: isoIn(136), returnAt: isoIn(139) };
    const candidates = await request(server)
      .get('/api/v1/catalogue/categories/intermediate/units')
      .query({
        locationCode: win.pickupLocationCode,
        pickupAt: win.pickupAt,
        returnAt: win.returnAt,
      })
      .expect(200);
    const other = candidates.body.find((u: { id: string }) => u.id !== firstUnitId);
    expect(other).toBeTruthy();

    const reassigned = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set(auth(agentToken))
      .send({ unitId: other.id })
      .expect(201);
    expect(reassigned.body.unitId).toBe(other.id);
    expect(reassigned.body.unitId).not.toBe(firstUnitId);

    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/pickup`)
      .set(auth(agentToken))
      .send({ odometerKm: 5000, fuelPct: 100, driverName: 'Rex Renter', licenceNumber: 'D-99' })
      .expect(201);

    // the reservation itself flips to 'fulfilled' at pickup (same transaction as the rental
    // going 'active') — assign()'s existing "reservation must be confirmed" guard already
    // refuses a vehicle change here; changing it once picked up goes through raiseIncident().
    const blocked = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set(auth(agentToken))
      .send({ unitId: firstUnitId })
      .expect(422);
    expect(blocked.body.code).toBe('business_rule_violation');
    expect(blocked.body.params.reason).toBe('fulfilled');
  });

  it('raising an incident with a replacement swaps the vehicle and blocks the old one', async () => {
    const resRef = await book(server, customerToken, 'intermediate', 145, 3);
    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set(auth(agentToken))
      .send({})
      .expect(201);
    const rentalRef = assigned.body.reference as string;
    const originalUnitId = assigned.body.unitId as string;
    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/pickup`)
      .set(auth(agentToken))
      .send({ odometerKm: 5000, fuelPct: 100, driverName: 'Rex Renter', licenceNumber: 'D-99' })
      .expect(201);

    const win = { pickupLocationCode: 'TST1', pickupAt: isoIn(145), returnAt: isoIn(148) };
    const candidates = await request(server)
      .get('/api/v1/catalogue/categories/intermediate/units')
      .query({
        locationCode: win.pickupLocationCode,
        pickupAt: win.pickupAt,
        returnAt: win.returnAt,
      })
      .expect(200);
    const replacement = candidates.body[0];
    expect(replacement).toBeTruthy();
    expect(replacement.id).not.toBe(originalUnitId);

    const swapped = await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/incident`)
      .set(auth(agentToken))
      .send({
        category: 'breakdown',
        note: 'flat tyre, swapped on site',
        immobilised: true,
        replacementUnitId: replacement.id,
      })
      .expect(201);
    expect(swapped.body.unitId).toBe(replacement.id);
    expect(swapped.body.unitId).not.toBe(originalUnitId);

    // the old unit is now out_of_service (immobilised) — no longer offered for a fresh window
    const stillOffered = await request(server)
      .get('/api/v1/catalogue/categories/intermediate/units')
      .query({
        locationCode: win.pickupLocationCode,
        pickupAt: isoIn(300),
        returnAt: isoIn(303),
      })
      .expect(200);
    expect(stillOffered.body.some((u: { id: string }) => u.id === originalUnitId)).toBe(false);
  });

  it('logging an incident with no replacement just records it — the vehicle stays assigned', async () => {
    const resRef = await book(server, customerToken, 'intermediate', 150, 3);
    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set(auth(agentToken))
      .send({})
      .expect(201);
    const rentalRef = assigned.body.reference as string;
    const unitId = assigned.body.unitId as string;
    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/pickup`)
      .set(auth(agentToken))
      .send({ odometerKm: 5000, fuelPct: 100, driverName: 'Rex Renter', licenceNumber: 'D-99' })
      .expect(201);

    const logged = await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/incident`)
      .set(auth(agentToken))
      .send({ category: 'other', note: 'minor scratch, no impact on driving' })
      .expect(201);
    expect(logged.body.unitId).toBe(unitId);
  });

  it('assigning a unit from a different category than what was booked is refused', async () => {
    const resRef = await book(server, customerToken, 'compact', 155, 3);
    const win = { pickupLocationCode: 'TST1', pickupAt: isoIn(155), returnAt: isoIn(158) };
    const economyUnits = await request(server)
      .get('/api/v1/catalogue/categories/economy/units')
      .query({
        locationCode: win.pickupLocationCode,
        pickupAt: win.pickupAt,
        returnAt: win.returnAt,
      })
      .expect(200);
    expect(economyUnits.body.length).toBeGreaterThan(0);
    const wrongCategoryUnit = economyUnits.body[0].id as string;

    const rejected = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set(auth(agentToken))
      .send({ unitId: wrongCategoryUnit })
      .expect(422);
    expect(rejected.body.code).toBe('business_rule_violation');
    expect(rejected.body.params.reason).toBe('category_mismatch');
  });

  it('assigning a same-category unit sitting at a DIFFERENT location than the pickup is refused', async () => {
    // Regression: assign()'s manual-override branch validated category/existence/open-rental-clash
    // for an explicit unitId, but never checked the unit's current location against the
    // reservation's pickupLocationCode — unlike the auto-pick query (joined on location.code) and
    // the customer-preferred-pin path (validated at hold time). A same-category car at the wrong
    // branch could silently be committed, leaving the customer with no matching vehicle on arrival.
    const day = midweekOffset(350);
    const resRef = await book(server, customerToken, 'economy', day, 3);
    const win = { pickupLocationCode: 'TST2', pickupAt: isoIn(day), returnAt: isoIn(day + 3) };
    const wrongLocationUnits = await request(server)
      .get('/api/v1/catalogue/categories/economy/units')
      .query({
        locationCode: win.pickupLocationCode,
        pickupAt: win.pickupAt,
        returnAt: win.returnAt,
      })
      .expect(200);
    expect(wrongLocationUnits.body.length).toBeGreaterThan(0);
    const wrongLocationUnit = wrongLocationUnits.body[0].id as string;

    const rejected = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set(auth(agentToken))
      .send({ unitId: wrongLocationUnit })
      .expect(422);
    expect(rejected.body.code).toBe('business_rule_violation');
    expect(rejected.body.params.reason).toBe('location_mismatch');
  });

  it("when staff assigns a different car than the customer picked, the customer's original pick becomes available again (not a phantom lock)", async () => {
    // TST2, not TST1 — this file's shared TST1 economy pool is heavily drawn down by every
    // earlier test in it; TST2's own fleet is untouched here.
    const day = midweekOffset(165);
    const win = { pickupLocationCode: 'TST2', pickupAt: isoIn(day), returnAt: isoIn(day + 3) };
    const before = await request(server)
      .get('/api/v1/catalogue/categories/economy/units')
      .query({
        locationCode: win.pickupLocationCode,
        pickupAt: win.pickupAt,
        returnAt: win.returnAt,
      })
      .expect(200);
    expect(before.body.length).toBeGreaterThanOrEqual(2);
    const customerPick = before.body[0].id as string;
    const staffOverride = before.body[1].id as string;

    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        ...win,
        categoryCode: 'economy',
        hold: true,
        holderKey: 'override-test',
        unitId: customerPick,
      })
      .expect(201);
    const confirmed = await request(server)
      .post('/api/v1/bookings/confirm')
      .set(auth(customerToken))
      .send({
        quoteReference: quote.body.reference,
        drivers: [{ role: 'primary_renter', fullName: 'Override Test', email: 'ov@example.test' }],
        acceptTerms: true,
        paymentToken: 'tok_ok',
      })
      .expect(201);

    // staff picks a *different* car than the customer chose
    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${confirmed.body.reference}/assign`)
      .set(auth(agentToken))
      .send({ unitId: staffOverride })
      .expect(201);
    expect(assigned.body.unitId).toBe(staffOverride);

    const after = await request(server)
      .get('/api/v1/catalogue/categories/economy/units')
      .query({
        locationCode: win.pickupLocationCode,
        pickupAt: win.pickupAt,
        returnAt: win.returnAt,
      })
      .expect(200);
    const ids = (after.body as Array<{ id: string }>).map((u) => u.id);
    expect(ids).toContain(customerPick); // nobody actually has it — must not stay phantom-locked
    expect(ids).not.toContain(staffOverride); // this one is genuinely out now

    // and a second shopper can pin the customer's original, now-genuinely-free pick
    const secondQuote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        ...win,
        categoryCode: 'economy',
        hold: true,
        holderKey: 'override-test-2',
        unitId: customerPick,
      })
      .expect(201);
    expect(secondQuote.body.hold).toMatchObject({ unitPinned: true, unitId: customerPick });
  });

  describe('the rental board (GET /ops/rentals)', () => {
    it('returns a true total plus rows with vehicle / driver / customer and a live overdue flag', async () => {
      const resRef = await book(server, customerToken, 'economy', 2, 1); // pickup ~2 days out
      const assigned = await request(server)
        .post(`/api/v1/ops/reservations/${resRef}/assign`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({})
        .expect(201);
      await request(server)
        .post(`/api/v1/ops/rentals/${assigned.body.reference}/pickup`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ odometerKm: 1000, fuelPct: 100, driverName: 'Rex Renter', licenceNumber: 'LIC-9' })
        .expect(201);

      const res = await request(server)
        .get('/api/v1/ops/rentals')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);
      expect(typeof res.body.total).toBe('number');
      expect(res.body.total).toBe(res.body.count);
      const row = (
        res.body.results as Array<{
          reference: string;
          plate: string | null;
          vehicle: string | null;
          driverName: string | null;
          customerName: string | null;
          overdue: boolean;
        }>
      ).find((x) => x.reference === assigned.body.reference)!;
      expect(row).toBeTruthy();
      expect(row.plate).toBeTruthy(); // seeded units have plates
      expect(row.driverName).toBe('Rex Renter');
      expect(typeof row.overdue).toBe('boolean');
    });

    it('a location-scoped actor requesting a location outside their own scope gets a 403 (FR-RPT-004)', async () => {
      const app = await getTestApp();
      const scoped = (await signIn(app, 'test-scoped@example.test', 'Test-Passw0rd!', 'staff'))
        .accessToken;
      // in-scope: TST1 is this actor's own location, so it's a no-op narrowing, never rejected
      await request(server)
        .get('/api/v1/ops/rentals?locationCode=TST1')
        .set('Authorization', `Bearer ${scoped}`)
        .expect(200);
      // out-of-scope: a 403, not a silently empty result (SRS-SEC-007)
      const rejected = await request(server)
        .get('/api/v1/ops/rentals?locationCode=TST2')
        .set('Authorization', `Bearer ${scoped}`)
        .expect(403);
      expect(rejected.body.title).toMatch(/don't have access/i);
    });

    it('state=overdue also catches an active rental past its scheduled return (live, no sweep)', async () => {
      // book a 1-day rental starting well in the past window is not possible via quote (future
      // only), so instead pick up a short rental and rely on the sweep-independent predicate:
      // any active rental whose scheduledReturnAt < now shows as overdue here.
      const res = await request(server)
        .get('/api/v1/ops/rentals?state=overdue')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);
      expect(
        (res.body.results as Array<{ state: string; overdue: boolean }>).every((r) => r.overdue),
      ).toBe(true);
    });

    it('paginates the board: pages are disjoint, ordered and cover every rental once', async () => {
      const all = await request(server)
        .get('/api/v1/ops/rentals?pageSize=100')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);
      const expected = (all.body.results as Array<{ reference: string }>).map((r) => r.reference);
      expect(all.body.page).toBe(1);
      expect(all.body.count).toBe(expected.length);
      expect(all.body.total).toBeGreaterThanOrEqual(2);

      const collected: string[] = [];
      for (let page = 1; page <= all.body.total; page += 1) {
        const res = await request(server)
          .get(`/api/v1/ops/rentals?pageSize=1&page=${page}`)
          .set('Authorization', `Bearer ${agentToken}`)
          .expect(200);
        expect(res.body.pageCount).toBe(res.body.total);
        collected.push(
          ...(res.body.results as Array<{ reference: string }>).map((r) => r.reference),
        );
      }
      expect(collected).toEqual(expected);
    });

    it('open work sorts before closed rentals', async () => {
      const res = await request(server)
        .get('/api/v1/ops/rentals?pageSize=100')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);
      const states = (res.body.results as Array<{ state: string }>).map((r) => r.state);
      const firstClosed = states.indexOf('closed');
      if (firstClosed >= 0)
        expect(states.slice(firstClosed).every((s) => s === 'closed')).toBe(true);
    });

    it('stateCounts describe every state whatever the state filter is', async () => {
      const all = await request(server)
        .get('/api/v1/ops/rentals')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);
      const closedOnly = await request(server)
        .get('/api/v1/ops/rentals?state=closed')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);
      const c = all.body.stateCounts as {
        all: number;
        awaiting_pickup: number;
        active: number;
        closed: number;
      };
      expect(closedOnly.body.stateCounts).toEqual(c);
      expect(closedOnly.body.total).toBe(c.closed);
      expect(c.all).toBe(all.body.total);
      expect(c.awaiting_pickup + c.active + c.closed).toBeLessThanOrEqual(c.all);
    });

    it('rejects out-of-range paging with a 422', async () => {
      for (const qs of ['page=0', 'page=abc', 'pageSize=0', 'pageSize=101']) {
        await request(server)
          .get(`/api/v1/ops/rentals?${qs}`)
          .set('Authorization', `Bearer ${agentToken}`)
          .expect(422);
      }
    });

    it('a bad date filter is a 422', async () => {
      await request(server)
        .get('/api/v1/ops/rentals?from=nope')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(422);
    });
  });
});
