import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * FR-PAY invoices — formal, immutable billing documents distinct from the lightweight printable
 * receipt.
 *  - no invoice is issued while the organization's legal profile is incomplete.
 *  - only config.publish can set the legal profile; If-Match protects concurrent edits.
 *  - confirming a booking (once the profile is set) issues an org-sequential invoice carrying a
 *    frozen snapshot of the legal identity + customer + trip + lines.
 *  - a cancellation / manual refund issues a credit note referencing the original invoice.
 */
const isoIn = (days: number, hour = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

const DRIVERS = [
  {
    role: 'primary_renter' as const,
    fullName: 'Ivy Invoice',
    email: 'ivy@example.test',
    licenceNumber: 'D-11223344',
    licenceCountry: 'US',
  },
];

async function bookAndConfirm(
  server: ReturnType<typeof httpServer>,
  customerToken: string,
  days: number,
) {
  const quote = await request(server)
    .post('/api/v1/discovery/quote')
    .send({
      pickupLocationCode: 'TST1',
      pickupAt: isoIn(days),
      returnAt: isoIn(days + 3),
      categoryCode: 'economy',
      holderKey: `inv-${Math.random().toString(36).slice(2)}`,
    })
    .expect(201);
  const confirmed = await request(server)
    .post('/api/v1/bookings/confirm')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({
      quoteReference: quote.body.reference,
      drivers: DRIVERS,
      acceptTerms: true,
      paymentToken: 'tok_ok',
    })
    .expect(201);
  return confirmed.body.reference as string;
}

describe('invoices', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let agentToken: string;
  let customerToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    customerToken = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;
  });
  afterAll(closeTestApp);

  it('issues no invoice while the organization legal profile is incomplete', async () => {
    const ref = await bookAndConfirm(server, customerToken, 20);
    const invoices = await request(server)
      .get(`/api/v1/reservations/${ref}/invoices`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(invoices.body).toEqual([]);
  });

  it('an agent without config.publish cannot set the legal profile', async () => {
    await request(server)
      .post('/api/v1/ops/organization/legal')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        legalName: 'Sneaky Rentals LLC',
        taxId: 'US-000',
        registeredAddress: { line1: '1 Sneaky Way', city: 'Nowhere' },
      })
      .expect(403);
  });

  it('admin sets the legal profile; a stale If-Match is rejected', async () => {
    const before = await request(server)
      .get('/api/v1/ops/organization/legal')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const version = before.body.version as number;

    // a stale version is refused
    await request(server)
      .post('/api/v1/ops/organization/legal')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('If-Match', '0')
      .send({
        legalName: 'Test Car Rental LLC',
        taxId: 'US-123456789',
        registeredAddress: {
          line1: '100 Fleet Ave',
          city: 'Metropolis',
          region: 'NY',
          postalCode: '10001',
          countryCode: 'US',
        },
      })
      .expect(409);

    const saved = await request(server)
      .post('/api/v1/ops/organization/legal')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('If-Match', String(version))
      .send({
        legalName: 'Test Car Rental LLC',
        taxId: 'US-123456789',
        registeredAddress: {
          line1: '100 Fleet Ave',
          city: 'Metropolis',
          region: 'NY',
          postalCode: '10001',
          countryCode: 'US',
        },
      })
      .expect(201);
    expect(saved.body).toMatchObject({ legalName: 'Test Car Rental LLC', taxId: 'US-123456789' });
    expect(saved.body.version).toBe(version + 1);
  });

  it('confirming a booking now issues a formal invoice with the frozen legal identity', async () => {
    const ref = await bookAndConfirm(server, customerToken, 22);

    const list = await request(server)
      .get(`/api/v1/reservations/${ref}/invoices`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    const inv = list.body[0];
    expect(inv.number).toMatch(/^INV-\d{6}$/);
    expect(inv.docVersion).toBe(1);
    expect(inv.kind).toBe('invoice');
    expect(inv.previousNumber).toBeNull();
    expect(inv.snapshot.org).toMatchObject({
      legalName: 'Test Car Rental LLC',
      taxId: 'US-123456789',
    });
    expect(inv.snapshot.customer.fullName).toBe('Ivy Invoice');
    expect(inv.snapshot.lines.length).toBeGreaterThan(0);

    const single = await request(server)
      .get(`/api/v1/reservations/${ref}/invoices/${inv.number}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(single.body.number).toBe(inv.number);

    // ops sees the same document
    const opsList = await request(server)
      .get(`/api/v1/ops/reservations/${ref}/invoices`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(opsList.body).toHaveLength(1);
    expect(opsList.body[0].number).toBe(inv.number);
  });

  it('two confirmations get two gapless, increasing invoice numbers', async () => {
    const refA = await bookAndConfirm(server, customerToken, 24);
    const refB = await bookAndConfirm(server, customerToken, 27);
    const [a] = (
      await request(server)
        .get(`/api/v1/reservations/${refA}/invoices`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200)
    ).body;
    const [b] = (
      await request(server)
        .get(`/api/v1/reservations/${refB}/invoices`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200)
    ).body;
    const seqA = Number(a.number.slice(4));
    const seqB = Number(b.number.slice(4));
    expect(seqB).toBe(seqA + 1);
  });

  it('cancelling a reservation issues a credit note referencing the original invoice', async () => {
    const ref = await bookAndConfirm(server, customerToken, 30);
    await request(server)
      .post(`/api/v1/reservations/${ref}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reasonCode: 'customer_request' })
      .expect(201);

    const list = await request(server)
      .get(`/api/v1/reservations/${ref}/invoices`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(list.body).toHaveLength(2);
    const [original, credit] = list.body;
    expect(original.kind).toBe('invoice');
    expect(credit.kind).toBe('credit_note');
    expect(credit.docVersion).toBe(2);
    expect(credit.previousNumber).toBe(original.number);
    expect(credit.totalMinor).toBeLessThan(0);
    expect(credit.totalMinor).toBe(-original.totalMinor);
  });

  it('a manual refund also issues a credit note', async () => {
    const ref = await bookAndConfirm(server, customerToken, 33);
    const before = await request(server)
      .get(`/api/v1/reservations/${ref}/invoices`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const totalMinor = before.body[0].totalMinor as number;
    const refundMinor = Math.floor(totalMinor / 2);

    await request(server)
      .post(`/api/v1/ops/reservations/${ref}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amountMinor: refundMinor, note: 'goodwill gesture' })
      .expect(201);

    const after = await request(server)
      .get(`/api/v1/reservations/${ref}/invoices`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(after.body).toHaveLength(2);
    expect(after.body[1]).toMatchObject({
      kind: 'credit_note',
      totalMinor: -refundMinor,
      reason: 'goodwill gesture',
    });
  });
});
