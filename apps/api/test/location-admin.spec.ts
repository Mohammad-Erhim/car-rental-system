import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * FR-ADM-007 / SCREEN-OPS-028 — location & operating-hours administration. Manage hours /
 * instructions / after-hours / supported categories, add holiday exceptions, and archive (never
 * delete) a location — with a future-reservation impact check before archiving.
 */
const isoIn = (days: number, hour = 12) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('location & operating-hours admin (FR-ADM-007)', () => {
  let server: ReturnType<typeof httpServer>;
  let admin: string;
  let agent: string;
  let customer: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    admin = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    agent = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    customer = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;
  });
  afterAll(closeTestApp);

  it('lists every location incl. status; a rental agent (no config.read) is refused', async () => {
    const res = await request(server)
      .get('/api/v1/ops/locations')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    const codes = (res.body as Array<{ code: string }>).map((l) => l.code);
    expect(codes).toEqual(expect.arrayContaining(['TST1', 'TST2']));

    await request(server)
      .get('/api/v1/ops/locations')
      .set('Authorization', `Bearer ${agent}`)
      .expect(403);
  });

  it('creates a location, then edits it; inverted hours are rejected', async () => {
    const created = await request(server)
      .post('/api/v1/ops/locations')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        code: 'TST3',
        name: 'Test Location 3',
        timezone: 'America/New_York',
        regularHours: [{ day: 1, open: '08:00', close: '18:00' }],
        pickupInstructions: 'Desk 4, level 2',
        supportedCategoryCodes: ['economy'],
      })
      .expect(201);
    expect(created.body.status).toBe('active');

    const got = await request(server)
      .get('/api/v1/ops/locations/TST3')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(got.body.pickupInstructions).toBe('Desk 4, level 2');
    expect(got.body.hoursExceptions).toEqual([]);

    await request(server)
      .post('/api/v1/ops/locations')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        code: 'TST3',
        name: 'Test Location 3',
        timezone: 'America/New_York',
        regularHours: [{ day: 1, open: '18:00', close: '08:00' }],
      })
      .expect(422)
      .expect((r) => expect(r.body.params?.reason).toBe('hours_inverted'));

    // upsert is not a back door around the archive impact check
    await request(server)
      .post('/api/v1/ops/locations')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        code: 'TST3',
        name: 'Test Location 3',
        timezone: 'America/New_York',
        status: 'archived',
      })
      .expect(422)
      .expect((r) => expect(r.body.params?.reason).toBe('archive_via_action'));
  });

  it('adds then removes a holiday closure exception', async () => {
    const added = await request(server)
      .post('/api/v1/ops/locations/TST3/hours-exceptions')
      .set('Authorization', `Bearer ${admin}`)
      .send({ date: '2026-12-25', closed: true, reason: 'Holiday' })
      .expect(201);
    const exId = added.body.id as string;

    const withEx = await request(server)
      .get('/api/v1/ops/locations/TST3')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(withEx.body.hoursExceptions).toHaveLength(1);
    expect(withEx.body.hoursExceptions[0].date).toBe('2026-12-25');

    await request(server)
      .post(`/api/v1/ops/locations/TST3/hours-exceptions/${exId}/remove`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(201);
    const cleared = await request(server)
      .get('/api/v1/ops/locations/TST3')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(cleared.body.hoursExceptions).toEqual([]);
  });

  it('archiving a location with future reservations reports the impact and needs force', async () => {
    // a future booking at TST1
    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(30),
        returnAt: isoIn(33),
        categoryCode: 'economy',
        holderKey: `loc-${Math.random().toString(36).slice(2)}`,
      })
      .expect(201);
    await request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        quoteReference: quote.body.reference,
        drivers: [{ role: 'primary_renter', fullName: 'Lou Location', licenceNumber: 'D-LOC-1' }],
        acceptTerms: true,
        paymentToken: 'tok_visa_ok',
      })
      .expect(201);

    const impact = await request(server)
      .get('/api/v1/ops/locations/TST1/impact')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(impact.body.futureReservations).toBeGreaterThanOrEqual(1);

    await request(server)
      .post('/api/v1/ops/locations/TST1/archive')
      .set('Authorization', `Bearer ${admin}`)
      .expect(422)
      .expect((r) => expect(r.body.params?.reason).toBe('location_has_future_reservations'));

    await request(server)
      .post('/api/v1/ops/locations/TST1/archive?force=true')
      .set('Authorization', `Bearer ${admin}`)
      .expect(201)
      .expect((r) => expect(r.body.status).toBe('archived'));

    // archived, not deleted — still retrievable, and restorable
    await request(server)
      .get('/api/v1/ops/locations/TST1')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    await request(server)
      .post('/api/v1/ops/locations/TST1/restore')
      .set('Authorization', `Bearer ${admin}`)
      .expect(201)
      .expect((r) => expect(r.body.status).toBe('active'));
  });
});
