import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * FR-ADM-006 / SCREEN-OPS-027 / SCREEN-CUS-005 — extras & protection products. Managed by
 * `catalogue.manage`; the server owns the price; the customer surface lists what's in scope; a
 * booking resolves `extraCodes` to priced lines (unknown/inactive/out-of-scope → rejected).
 */
const isoIn = (days: number, hour = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('extras & protection products (FR-ADM-006)', () => {
  let server: ReturnType<typeof httpServer>;
  let managerToken: string;
  let agentToken: string;
  let customerToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    managerToken = (await signIn(app, 'test-manager@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    customerToken = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;
  });
  afterAll(closeTestApp);

  const quote = () =>
    request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(5),
        returnAt: isoIn(8),
        categoryCode: 'economy',
        holderKey: `prod-${Math.random().toString(36).slice(2)}`,
      })
      .expect(201);

  it('the seeded catalogue lists extras + protection', async () => {
    const res = await request(server)
      .get('/api/v1/ops/catalogue/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    const codes = (res.body as Array<{ code: string }>).map((p) => p.code);
    expect(codes).toEqual(expect.arrayContaining(['protection_full', 'additional_driver', 'gps']));
  });

  it('the customer surface lists products in scope for a category + location', async () => {
    const res = await request(server)
      .get('/api/v1/catalogue/products?category=economy&location=TST1')
      .expect(200);
    expect((res.body as unknown[]).length).toBeGreaterThanOrEqual(3);
  });

  it('a rental_agent (no catalogue.manage) cannot edit products', async () => {
    await request(server)
      .post('/api/v1/ops/catalogue/products')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ code: 'x_new', name: 'X', kind: 'extra', unitPriceMinor: 100 })
      .expect(403);
  });

  it('rejects a category / location scope or currency that is not in the catalogue', async () => {
    await request(server)
      .post('/api/v1/ops/catalogue/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        code: 'bad_scope',
        name: 'X',
        kind: 'extra',
        unitPriceMinor: 100,
        categoryScope: ['nope'],
      })
      .expect(422)
      .expect((r) => expect(r.body.fieldErrors?.[0]?.path).toBe('categoryScope.0'));

    await request(server)
      .post('/api/v1/ops/catalogue/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        code: 'bad_scope',
        name: 'X',
        kind: 'extra',
        unitPriceMinor: 100,
        locationScope: ['ZZZZ'],
      })
      .expect(422)
      .expect((r) => expect(r.body.fieldErrors?.[0]?.path).toBe('locationScope.0'));

    await request(server)
      .post('/api/v1/ops/catalogue/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: 'bad_ccy', name: 'X', kind: 'extra', unitPriceMinor: 100, currency: 'ZZZ' })
      .expect(422)
      .expect((r) => expect(r.body.fieldErrors?.[0]?.path).toBe('currency'));
  });

  it('a manager can create, reprice, and deactivate a product', async () => {
    const created = await request(server)
      .post('/api/v1/ops/catalogue/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        code: 'ski_rack',
        name: 'Ski rack',
        kind: 'extra',
        unitPriceMinor: 1200,
        maxQuantity: 2,
      })
      .expect(201);
    expect(created.body.unitPriceMinor).toBe(1200);

    const repriced = await request(server)
      .post('/api/v1/ops/catalogue/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        code: 'ski_rack',
        name: 'Ski rack',
        kind: 'extra',
        unitPriceMinor: 1500,
        maxQuantity: 2,
      })
      .expect(201);
    expect(repriced.body.unitPriceMinor).toBe(1500);

    await request(server)
      .post('/api/v1/ops/catalogue/products/ski_rack/deactivate')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    const list = await request(server)
      .get('/api/v1/catalogue/products?category=economy&location=TST1')
      .expect(200);
    expect((list.body as Array<{ code: string }>).some((p) => p.code === 'ski_rack')).toBe(false);
  });

  it('booking resolves extraCodes to catalogue-priced lines; total = quote + priced extras + tax', async () => {
    const q = (await quote()).body as { reference: string; totalMinor: number };
    const res = await request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        quoteReference: q.reference,
        drivers: [
          {
            role: 'primary_renter',
            fullName: 'Prod Tester',
            licenceNumber: 'D-P1',
            licenceCountry: 'US',
          },
        ],
        acceptTerms: true,
        paymentToken: 'tok_visa_ok',
        extraCodes: ['additional_driver', 'additional_driver', 'child_seat'],
      })
      .expect(201);

    const lines = res.body.lines as Array<{
      kind: string;
      code: string;
      quantity: number;
      unitMinor: number;
      amountMinor: number;
    }>;
    // additional_driver is priced per billable day (seed: $9/day); the quote is a 3-day rental
    const addDriver = lines.find((l) => l.kind === 'extra' && l.code === 'additional_driver')!;
    expect(addDriver.quantity).toBe(2);
    expect(addDriver.unitMinor).toBe(2700); // 900 × 3 days
    expect(addDriver.amountMinor).toBe(5400); // × 2 drivers
    // child_seat is a one-off (per_rental)
    const childSeat = lines.find((l) => l.kind === 'extra' && l.code === 'child_seat')!;
    expect(childSeat).toBeTruthy();
    expect(childSeat.unitMinor).toBe(700);
    expect(childSeat.amountMinor).toBe(700);

    const sum = lines.reduce((a, l) => a + l.amountMinor, 0);
    expect(sum).toBe(res.body.totalMinor); // lines still sum to the total
    expect(res.body.totalMinor).toBeGreaterThan(q.totalMinor);
    expect(res.body.paidMinor).toBe(res.body.totalMinor);
  });

  it('exceeding a product max quantity is rejected (no charge, no reservation)', async () => {
    const q = (await quote()).body as { reference: string };
    await request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        quoteReference: q.reference,
        drivers: [
          { role: 'primary_renter', fullName: 'Q', licenceNumber: 'D-Q', licenceCountry: 'US' },
        ],
        acceptTerms: true,
        paymentToken: 'tok_visa_ok',
        extraCodes: ['gps', 'gps'], // gps maxQuantity = 1
      })
      .expect(422);
  });
});
