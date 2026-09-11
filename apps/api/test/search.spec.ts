import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * FR-ADM-003 / SCREEN-OPS-004 — one search across reservations *and* rentals. Find a booking by
 * reference or driver, find the rental it became, narrow by kind; a customer cannot use it.
 */
const isoIn = (days: number, hour = 10) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  // the seeded locations are closed at weekends and this suite books real pickup/return times —
  // nudge onto the next weekday so the fixture dates don't land on a closed day.
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
};

describe('unified reservation + rental search (FR-ADM-003)', () => {
  let server: ReturnType<typeof httpServer>;
  let app: Awaited<ReturnType<typeof getTestApp>>;
  let agent: string;
  let scopedAgent: string;
  let customer: string;
  let resRef: string;
  let rentalRef: string;
  let otherLocationRef: string;

  const book = async (locationCode: string, driverName: string) => {
    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: locationCode,
        pickupAt: isoIn(20),
        returnAt: isoIn(23),
        categoryCode: 'economy',
        holderKey: `srch-${Math.random().toString(36).slice(2)}`,
      })
      .expect(201);
    const booked = await request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        quoteReference: quote.body.reference,
        drivers: [{ role: 'primary_renter', fullName: driverName, licenceNumber: 'D-SRCH-1' }],
        acceptTerms: true,
        paymentToken: 'tok_visa_ok',
      })
      .expect(201);
    return booked.body.reference as string;
  };

  beforeAll(async () => {
    app = await getTestApp();
    server = httpServer(app);
    agent = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    // finance_staff confined to TST1 (has reservation.read + rental.read) — proves search
    // honours the same location boundary as the reports (FR-RPT-004).
    scopedAgent = (await signIn(app, 'test-scoped@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    customer = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;

    resRef = await book('TST1', 'Sydney Searcher');
    otherLocationRef = await book('TST2', 'Sydney Searcher');

    const assigned = await request(server)
      .post(`/api/v1/ops/reservations/${resRef}/assign`)
      .set('Authorization', `Bearer ${agent}`)
      .send({})
      .expect(201);
    rentalRef = assigned.body.reference;
    await request(server)
      .post(`/api/v1/ops/rentals/${rentalRef}/pickup`)
      .set('Authorization', `Bearer ${agent}`)
      .send({
        odometerKm: 5000,
        fuelPct: 100,
        driverName: 'Sydney Searcher',
        licenceNumber: 'D-SRCH-1',
      })
      .expect(201);
  });
  afterAll(closeTestApp);

  it('a customer cannot use the ops search', async () => {
    await request(server)
      .get('/api/v1/ops/search?q=RES')
      .set('Authorization', `Bearer ${customer}`)
      .expect(403);
  });

  it('a one-character query is rejected', async () => {
    await request(server)
      .get('/api/v1/ops/search?q=R')
      .set('Authorization', `Bearer ${agent}`)
      .expect(422);
  });

  it('a malformed date filter is a 422, not a 500', async () => {
    await request(server)
      .get('/api/v1/ops/search?q=Sydney%20Searcher&from=not-a-date')
      .set('Authorization', `Bearer ${agent}`)
      .expect(422);
  });

  it('finds the reservation by its reference', async () => {
    const res = await request(server)
      .get(`/api/v1/ops/search?q=${encodeURIComponent(resRef)}`)
      .set('Authorization', `Bearer ${agent}`)
      .expect(200);
    const hit = (res.body.results as Array<{ kind: string; reference: string; href: string }>).find(
      (h) => h.kind === 'reservation' && h.reference === resRef,
    );
    expect(hit).toBeTruthy();
    expect(hit!.href).toContain('/work/');
  });

  it('finds both the reservation and the rental by the shared driver name', async () => {
    const res = await request(server)
      .get('/api/v1/ops/search?q=Sydney%20Searcher')
      .set('Authorization', `Bearer ${agent}`)
      .expect(200);
    const kinds = new Set((res.body.results as Array<{ kind: string }>).map((h) => h.kind));
    expect(kinds.has('reservation')).toBe(true);
    expect(kinds.has('rental')).toBe(true);
    const rental = (
      res.body.results as Array<{
        kind: string;
        reference: string;
        reservationReference: string | null;
      }>
    ).find((h) => h.kind === 'rental')!;
    expect(rental.reference).toBe(rentalRef);
    expect(rental.reservationReference).toBe(resRef);
  });

  it('kind=reservation returns only reservations', async () => {
    const res = await request(server)
      .get('/api/v1/ops/search?q=Sydney%20Searcher&kind=reservation')
      .set('Authorization', `Bearer ${agent}`)
      .expect(200);
    expect(
      (res.body.results as Array<{ kind: string }>).every((h) => h.kind === 'reservation'),
    ).toBe(true);
    expect(res.body.results.length).toBeGreaterThanOrEqual(1);
  });

  it('narrows by pickup location', async () => {
    const hit = await request(server)
      .get('/api/v1/ops/search?q=Sydney%20Searcher&locationCode=TST1')
      .set('Authorization', `Bearer ${agent}`)
      .expect(200);
    expect(hit.body.results.length).toBeGreaterThanOrEqual(2);
    const miss = await request(server)
      .get('/api/v1/ops/search?q=Sydney%20Searcher&locationCode=NOPE')
      .set('Authorization', `Bearer ${agent}`)
      .expect(200);
    expect(miss.body.results.length).toBe(0);
  });

  it('reports the true total and flags truncation', async () => {
    const res = await request(server)
      .get('/api/v1/ops/search?q=Sydney%20Searcher&limit=1')
      .set('Authorization', `Bearer ${agent}`)
      .expect(200);
    expect(res.body.results.length).toBe(1);
    expect(res.body.total).toBeGreaterThanOrEqual(3); // 2 reservations (TST1+TST2) + 1 rental
    expect(res.body.count).toBe(1);
    expect(res.body.truncated).toBe(true);
  });

  it('a location-scoped actor only sees rows for their own locations (FR-RPT-004)', async () => {
    const orgWide = await request(server)
      .get('/api/v1/ops/search?q=Sydney%20Searcher')
      .set('Authorization', `Bearer ${agent}`)
      .expect(200);
    const orgRefs = (orgWide.body.results as Array<{ reference: string }>).map((h) => h.reference);
    expect(orgRefs).toContain(resRef); // TST1
    expect(orgRefs).toContain(otherLocationRef); // TST2

    const scoped = await request(server)
      .get('/api/v1/ops/search?q=Sydney%20Searcher')
      .set('Authorization', `Bearer ${scopedAgent}`)
      .expect(200);
    const scopedRefs = (
      scoped.body.results as Array<{ reference: string; locationCode: string }>
    ).map((h) => h.reference);
    expect(scopedRefs).toContain(resRef); // TST1 — in scope
    expect(scopedRefs).not.toContain(otherLocationRef); // TST2 — out of scope
    expect(
      (scoped.body.results as Array<{ locationCode: string }>).every(
        (h) => h.locationCode === 'TST1',
      ),
    ).toBe(true);
    expect(scoped.body.total).toBeLessThan(orgWide.body.total);
  });

  it('records every search to the audit trail (PII lookup — SRS-SEC-016)', async () => {
    const admin = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    await request(server)
      .get('/api/v1/ops/search?q=D-SRCH-1')
      .set('Authorization', `Bearer ${agent}`)
      .expect(200);
    const audit = await request(server)
      .get('/api/v1/ops/audit?action=ops.search')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    const rows = audit.body as Array<{ action: string; after?: { query?: string } }>;
    expect(rows.some((r) => r.action === 'ops.search' && r.after?.query === 'D-SRCH-1')).toBe(true);
  });
});
