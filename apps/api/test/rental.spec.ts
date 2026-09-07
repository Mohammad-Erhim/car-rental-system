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
  let customerToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
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
});
