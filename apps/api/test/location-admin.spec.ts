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

  it('rejects an invalid timezone, an unknown category, and duplicate weekly days', async () => {
    const base = { code: 'TST3', name: 'Test Location 3', timezone: 'America/New_York' };

    const badTz = await request(server)
      .post('/api/v1/ops/locations')
      .set('Authorization', `Bearer ${admin}`)
      .send({ ...base, timezone: 'America/Notreal' })
      .expect(422);
    expect(badTz.body.fieldErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'timezone', code: 'invalid_timezone' }),
      ]),
    );

    const badCat = await request(server)
      .post('/api/v1/ops/locations')
      .set('Authorization', `Bearer ${admin}`)
      .send({ ...base, supportedCategoryCodes: ['economy', 'made_up_class'] })
      .expect(422);
    expect(badCat.body.fieldErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'supportedCategoryCodes.1', code: 'unsupported' }),
      ]),
    );

    const dupDay = await request(server)
      .post('/api/v1/ops/locations')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        ...base,
        regularHours: [
          { day: 1, open: '08:00', close: '12:00' },
          { day: 1, open: '13:00', close: '18:00' },
        ],
      })
      .expect(422);
    expect(dupDay.body.fieldErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'regularHours.1.day', code: 'duplicate' }),
      ]),
    );

    const badCoord = await request(server)
      .post('/api/v1/ops/locations')
      .set('Authorization', `Bearer ${admin}`)
      .send({ ...base, latitude: '200', longitude: 'abc' })
      .expect(422);
    expect(badCoord.body.fieldErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'latitude', code: 'out_of_range' }),
        expect.objectContaining({ path: 'longitude', code: 'out_of_range' }),
      ]),
    );
  });

  it('two concurrent creates of the same code never 500 — the loser gets a clean 409', async () => {
    const body = { code: 'RACE1', name: 'Race Location', timezone: 'America/New_York' };
    const results = await Promise.all(
      [0, 1].map(() =>
        request(server)
          .post('/api/v1/ops/locations')
          .set('Authorization', `Bearer ${admin}`)
          .send(body),
      ),
    );
    // no unhandled unique-violation leaked as a 500
    expect(results.every((r) => r.status < 500)).toBe(true);
    expect(results.some((r) => r.status === 201)).toBe(true);
    const loser = results.find((r) => r.status === 409);
    if (loser) expect(loser.body.params?.reason).toBe('code_exists');
  });

  it('the org legal-profile update is atomically version-guarded — two genuinely concurrent saves cannot both win', async () => {
    const current = await request(server)
      .get('/api/v1/ops/organization/legal')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    const startVersion = current.body.version;

    // fired concurrently against the SAME starting version — a sequential await-then-await
    // wouldn't exercise the actual UPDATE...WHERE race.
    const [a, b] = await Promise.allSettled([
      request(server)
        .post('/api/v1/ops/organization/legal')
        .set('Authorization', `Bearer ${admin}`)
        .set('If-Match', String(startVersion))
        .send({ legalName: 'Race Rentals A', taxId: 'TAX-A', registeredAddress: { line1: 'A' } }),
      request(server)
        .post('/api/v1/ops/organization/legal')
        .set('Authorization', `Bearer ${admin}`)
        .set('If-Match', String(startVersion))
        .send({ legalName: 'Race Rentals B', taxId: 'TAX-B', registeredAddress: { line1: 'B' } }),
    ]);

    const results = [a, b].map((r) => (r.status === 'fulfilled' ? r.value.status : -1));
    expect(results.filter((s) => s === 201)).toHaveLength(1);
    expect(results.filter((s) => s === 409)).toHaveLength(1);
    const loser = [a, b].find((r) => r.status === 'fulfilled' && r.value.status === 409) as
      | PromiseFulfilledResult<request.Response>
      | undefined;
    expect(loser?.value.body.code).toBe('version_conflict');

    const after = await request(server)
      .get('/api/v1/ops/organization/legal')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(['Race Rentals A', 'Race Rentals B']).toContain(after.body.legalName);
    expect(after.body.version).toBe(startVersion + 1);
  });

  it('a draft or archived location is not bookable through search / quote', async () => {
    await request(server)
      .post('/api/v1/ops/locations/TST2/archive?force=true')
      .set('Authorization', `Bearer ${admin}`)
      .expect(201);

    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST2',
        pickupAt: isoIn(20),
        returnAt: isoIn(23),
        categoryCode: 'economy',
        holderKey: `loc-arch-${Math.random().toString(36).slice(2)}`,
      })
      .expect(404);
    expect(quote.body.params?.reason).toBe('location_not_active');

    await request(server)
      .post('/api/v1/ops/locations/TST2/restore')
      .set('Authorization', `Bearer ${admin}`)
      .expect(201);
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

    // a second exception for the same date is refused
    const dup = await request(server)
      .post('/api/v1/ops/locations/TST3/hours-exceptions')
      .set('Authorization', `Bearer ${admin}`)
      .send({ date: '2026-12-25', closed: false, open: '10:00', close: '14:00' })
      .expect(409);
    expect(dup.body.params?.reason).toBe('exception_exists');

    // a reduced-hours exception with inverted times is refused
    await request(server)
      .post('/api/v1/ops/locations/TST3/hours-exceptions')
      .set('Authorization', `Bearer ${admin}`)
      .send({ date: '2026-12-24', closed: false, open: '18:00', close: '09:00' })
      .expect(422)
      .expect((r) => expect(r.body.params?.reason).toBe('hours_inverted'));

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
    expect(impact.body).toHaveProperty('openRentals');

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
