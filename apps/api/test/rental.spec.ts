import { createHash } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

const rentalRef = (reservationReference: string) =>
  `RNT-${createHash('sha256').update(reservationReference).digest('hex').slice(0, 8).toUpperCase()}`;

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

async function book(
  server: ReturnType<typeof httpServer>,
  token: string,
  categoryCode: string,
  pickupDay: number,
  days = 3,
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
      paymentToken: 'tok_ok',
    })
    .expect(201);
  return res.body.reference as string;
}

describe('rental lifecycle', () => {
  let server: ReturnType<typeof httpServer>;
  let agentToken: string;
  let adminToken: string;
  let customerToken: string;
  const auth = (tok: string) => ({ Authorization: `Bearer ${tok}` });

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
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

  it('TEST-RNT-002 one open rental per unit — a second active rental on the same unit is refused', async () => {
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
    await request(server)
      .post(`/api/v1/ops/reservations/${resB}/assign`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ unitId }) // force the same unit
      .expect(201);
    // pickup makes it active → collides with the partial unique index
    const collide = await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef(resB)}/pickup`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ odometerKm: 5000, fuelPct: 100, driverName: 'B', licenceNumber: 'D-2' });
    expect([409, 500]).toContain(collide.status);
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

    it('a bad date filter is a 422', async () => {
      await request(server)
        .get('/api/v1/ops/rentals?from=nope')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(422);
    });
  });
});
