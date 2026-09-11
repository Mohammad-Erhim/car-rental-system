import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * SCREEN-OPS-021/022 · FR-ADM-001 — customer record search + consolidated view (read side).
 * Search needs a query; list contact detail is masked; the detail view consolidates drivers,
 * reservations, rentals, balance, open cases, and active restrictions; `customer.read` gates it.
 */
const isoIn = (days: number, hour = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('customer records (SCREEN-OPS-021/022 / FR-ADM-001)', () => {
  let server: ReturnType<typeof httpServer>;
  let agentToken: string; // rental_agent — has customer.read
  let adminToken: string; // administrator — for the audit viewer
  let financeToken: string; // finance_staff — no customer.read
  let customerToken: string;

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

    // give the customer a reservation so the consolidated record has content
    const q = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(5),
        returnAt: isoIn(8),
        categoryCode: 'economy',
        holderKey: `cust-rec-${Math.random().toString(36).slice(2)}`,
      })
      .expect(201);
    await request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        quoteReference: q.body.reference,
        drivers: [
          {
            role: 'primary_renter',
            fullName: 'Test Customer',
            licenceNumber: 'D-TC',
            licenceCountry: 'US',
          },
        ],
        acceptTerms: true,
        paymentToken: 'tok_visa_ok',
      })
      .expect(201);
  });
  afterAll(closeTestApp);

  it('a query shorter than 2 chars is rejected', async () => {
    await request(server)
      .get('/api/v1/ops/customers?q=a')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(422);
  });

  it('finds the customer by name; list contact detail is masked', async () => {
    const res = await request(server)
      .get('/api/v1/ops/customers?q=Test')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    const hit = (res.body.results as Array<{ fullName: string; email: string | null }>).find(
      (r) => r.fullName === 'Test Customer',
    );
    expect(hit).toBeTruthy();
    expect(hit!.email).toMatch(/\*\*\*@/); // masked

    // the lookup is a PII access — it is on the audit trail
    const audit = await request(server)
      .get('/api/v1/ops/audit?action=customer.searched')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (audit.body.entries as Array<{ action: string; after?: { query?: string } }>).some(
        (a) => a.action === 'customer.searched' && a.after?.query === 'Test',
      ),
    ).toBe(true);
  });

  it('consolidates the record: contact in full, reservation + balance present', async () => {
    const list = await request(server)
      .get('/api/v1/ops/customers?q=Test%20Customer')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    const id = (list.body.results as Array<{ id: string; fullName: string }>).find(
      (r) => r.fullName === 'Test Customer',
    )!.id;

    const rec = await request(server)
      .get(`/api/v1/ops/customers/${id}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    expect(rec.body.email).toBe('test-customer@example.test'); // full, deliberate open
    expect(rec.body.reservations.length).toBeGreaterThanOrEqual(1);
    expect(rec.body.balance).toHaveProperty('minor');
    expect(rec.body.balance).toHaveProperty('currency');
    expect(Number.isInteger(rec.body.balance.minor)).toBe(true);
    expect(Array.isArray(rec.body.restrictions)).toBe(true);
    expect(Array.isArray(rec.body.drivers)).toBe(true);

    // opening the full record is itself a PII access — on the audit trail (SRS-SEC-016)
    const audit = await request(server)
      .get('/api/v1/ops/audit?action=customer.viewed')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (audit.body.entries as Array<{ action: string; targetId: string }>).some(
        (a) => a.action === 'customer.viewed' && a.targetId === id,
      ),
    ).toBe(true);
  });

  it('finance staff (no customer.read) is 403', async () => {
    await request(server)
      .get('/api/v1/ops/customers?q=Test')
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(403);
  });

  it('an unknown id is a clean 404', async () => {
    await request(server)
      .get('/api/v1/ops/customers/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(404);
  });
});
