import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * FR-ADM-002 — customer eligibility restrictions, write side + enforcement. A `block` restriction
 * is created `pending_review`, approved by a *different* user, then denies the customer's booking
 * until it is lifted. `review` restrictions never block. `customer.manage` gates every write.
 */
const isoIn = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(11, 0, 0, 0);
  return d.toISOString();
};

describe('customer eligibility restrictions (FR-ADM-002)', () => {
  let server: ReturnType<typeof httpServer>;
  let admin: string;
  let manager: string;
  let agent: string;
  let customerTok: string;
  let customerId: string;

  let dayCursor = 14;
  const book = async (category: string) => {
    const day = (dayCursor += 3); // a fresh non-overlapping window per booking
    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt: isoIn(day),
        returnAt: isoIn(day + 2),
        categoryCode: category,
        holderKey: `rstr-${Math.random().toString(36).slice(2)}`,
      })
      .expect(201);
    return request(server)
      .post('/api/v1/bookings/confirm')
      .set('Authorization', `Bearer ${customerTok}`)
      .send({
        quoteReference: quote.body.reference,
        drivers: [{ role: 'primary_renter', fullName: 'Test Customer', licenceNumber: 'D-R-1' }],
        acceptTerms: true,
        paymentToken: 'tok_visa_ok',
      });
  };

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    admin = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    manager = (await signIn(app, 'test-manager@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agent = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    customerTok = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;

    const found = await request(server)
      .get('/api/v1/ops/customers?q=Test%20Customer')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    // the account-backed record (the one `test-customer@example.test` signs in as)
    customerId = (found.body.results as Array<{ id: string; fullName: string }>).find(
      (r) => r.fullName === 'Test Customer',
    )!.id;
    expect(customerId).toBeTruthy();
  });
  afterAll(closeTestApp);

  it('a rental agent (customer.read only) cannot create a restriction', async () => {
    await request(server)
      .post(`/api/v1/ops/customers/${customerId}/restrictions`)
      .set('Authorization', `Bearer ${agent}`)
      .send({ category: 'block', scope: 'all' })
      .expect(403);
  });

  it('create → author cannot self-approve → a second manager approves → enforced → lifted', async () => {
    // a clean booking works first
    await book('economy').then((r) => expect(r.status).toBe(201));

    const created = await request(server)
      .post(`/api/v1/ops/customers/${customerId}/restrictions`)
      .set('Authorization', `Bearer ${manager}`)
      .send({ category: 'block', scope: 'all', reasonCode: 'complaint', evidenceRef: 'CASE-99' })
      .expect(201);
    expect(created.body.status).toBe('pending_review');
    expect(created.body.isActive).toBe(false);
    const rid = created.body.id as string;

    // segregation of duties — the author cannot approve their own
    await request(server)
      .post(`/api/v1/ops/customers/${customerId}/restrictions/${rid}/approve`)
      .set('Authorization', `Bearer ${manager}`)
      .send({})
      .expect(403);

    // still pending → still not enforced
    await book('economy').then((r) => expect(r.status).toBe(201));

    const approved = await request(server)
      .post(`/api/v1/ops/customers/${customerId}/restrictions/${rid}/approve`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ notes: 'confirmed with the customer' })
      .expect(201);
    expect(approved.body.status).toBe('active');
    expect(approved.body.isActive).toBe(true);

    // now the customer's booking is denied
    const denied = await book('economy');
    expect(denied.status).toBe(422);
    expect(denied.body.params?.reason).toBe('customer_restricted');

    // lift it → booking works again
    const lifted = await request(server)
      .post(`/api/v1/ops/customers/${customerId}/restrictions/${rid}/lift`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ notes: 'resolved' })
      .expect(201);
    expect(lifted.body.status).toBe('lifted');
    await book('economy').then((r) => expect(r.status).toBe(201));
  });

  it('a rejected restriction never becomes active and cannot be re-decided', async () => {
    const created = await request(server)
      .post(`/api/v1/ops/customers/${customerId}/restrictions`)
      .set('Authorization', `Bearer ${manager}`)
      .send({ category: 'block', scope: 'all' })
      .expect(201);
    const rid = created.body.id as string;

    const rejected = await request(server)
      .post(`/api/v1/ops/customers/${customerId}/restrictions/${rid}/reject`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ notes: 'insufficient evidence' })
      .expect(201);
    expect(rejected.body.status).toBe('rejected');
    expect(rejected.body.isActive).toBe(false);

    // a rejected row does not enforce
    await book('economy').then((r) => expect(r.status).toBe(201));

    // and cannot be approved or lifted afterwards
    await request(server)
      .post(`/api/v1/ops/customers/${customerId}/restrictions/${rid}/approve`)
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(422)
      .expect((r) => expect(r.body.params?.reason).toBe('restriction_not_pending'));
    await request(server)
      .post(`/api/v1/ops/customers/${customerId}/restrictions/${rid}/lift`)
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(422)
      .expect((r) => expect(r.body.params?.reason).toBe('restriction_not_active'));
  });

  it('a scoped restriction only blocks bookings in that scope; review restrictions never block', async () => {
    // review category — never blocks, even when active-shaped
    await request(server)
      .post(`/api/v1/ops/customers/${customerId}/restrictions`)
      .set('Authorization', `Bearer ${manager}`)
      .send({ category: 'review', scope: 'all' })
      .expect(201);
    await book('economy').then((r) => expect(r.status).toBe(201));

    // an active block scoped to a *different* location does not touch a TST1 booking
    const otherLoc = await request(server)
      .post(`/api/v1/ops/customers/${customerId}/restrictions`)
      .set('Authorization', `Bearer ${manager}`)
      .send({ category: 'block', scope: 'location:TST2' })
      .expect(201);
    await request(server)
      .post(`/api/v1/ops/customers/${customerId}/restrictions/${otherLoc.body.id}/approve`)
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(201);
    await book('economy').then((r) => expect(r.status).toBe(201)); // TST1 booking, out of scope

    // an active block scoped to the economy class now denies the TST1 economy booking
    const scoped = await request(server)
      .post(`/api/v1/ops/customers/${customerId}/restrictions`)
      .set('Authorization', `Bearer ${manager}`)
      .send({ category: 'block', scope: 'category:economy' })
      .expect(201);
    await request(server)
      .post(`/api/v1/ops/customers/${customerId}/restrictions/${scoped.body.id}/approve`)
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(201);
    const denied = await book('economy');
    expect(denied.status).toBe(422);
    expect(denied.body.params?.reason).toBe('customer_restricted');
  });
});
