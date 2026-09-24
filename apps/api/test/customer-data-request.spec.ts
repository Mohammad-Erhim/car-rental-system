import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * FR-IAM-008 (staff side) — a customer's access / correction / closure request is created via
 * `/auth/data-requests` (customer-facing, tested elsewhere); this covers the ops resolve flow:
 * `customer.read` can list, `customer.manage` gates review/complete/reject, and a terminal request
 * cannot be re-decided. Completing a `closure` request only records the decision here — nothing
 * in this codebase deactivates the account.
 */
describe('customer privacy requests, staff side (FR-IAM-008)', () => {
  let server: ReturnType<typeof httpServer>;
  let admin: string;
  let agent: string;
  let customerTok: string;
  let customerId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    admin = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    agent = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    customerTok = (await signIn(app, 'test-customer@example.test', 'Test-Passw0rd!', 'customer'))
      .accessToken;

    const found = await request(server)
      .get('/api/v1/ops/customers?q=Test%20Customer')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    customerId = (found.body.results as Array<{ id: string; fullName: string }>).find(
      (r) => r.fullName === 'Test Customer',
    )!.id;
    expect(customerId).toBeTruthy();
  });
  afterAll(closeTestApp);

  const fileRequest = (kind: 'access' | 'correction' | 'closure') =>
    request(server)
      .post('/api/v1/auth/data-requests')
      .set('Authorization', `Bearer ${customerTok}`)
      .send({ kind, detail: `please ${kind} my data` })
      .expect(201)
      .then((r) => r.body.id as string);

  it('shows up in the customer workspace record', async () => {
    const id = await fileRequest('access');
    const record = await request(server)
      .get(`/api/v1/ops/customers/${customerId}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    const row = (record.body.dataRequests as Array<{ id: string; status: string }>).find(
      (r) => r.id === id,
    );
    expect(row?.status).toBe('received');
  });

  it('a rental agent (customer.read only) cannot review, complete or reject', async () => {
    const id = await fileRequest('access');
    await request(server)
      .post(`/api/v1/ops/customers/${customerId}/data-requests/${id}/review`)
      .set('Authorization', `Bearer ${agent}`)
      .send({})
      .expect(403);
    await request(server)
      .post(`/api/v1/ops/customers/${customerId}/data-requests/${id}/complete`)
      .set('Authorization', `Bearer ${agent}`)
      .send({})
      .expect(403);
  });

  it('received → in_review → completed, with a resolution note recorded', async () => {
    const id = await fileRequest('access');

    const reviewed = await request(server)
      .post(`/api/v1/ops/customers/${customerId}/data-requests/${id}/review`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ notes: 'looking into it' })
      .expect(201);
    expect(reviewed.body.status).toBe('in_review');

    const completed = await request(server)
      .post(`/api/v1/ops/customers/${customerId}/data-requests/${id}/complete`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ notes: 'export sent to the customer by email' })
      .expect(201);
    expect(completed.body.status).toBe('completed');
    expect(completed.body.resolutionNote).toBe('export sent to the customer by email');
    expect(completed.body.resolvedBy).toBeTruthy();
    expect(completed.body.resolvedAt).toBeTruthy();
  });

  it('a fresh (received) request can be rejected directly, no review step required', async () => {
    const id = await fileRequest('correction');
    const rejected = await request(server)
      .post(`/api/v1/ops/customers/${customerId}/data-requests/${id}/reject`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ notes: 'could not verify the requested change' })
      .expect(201);
    expect(rejected.body.status).toBe('rejected');
    expect(rejected.body.resolutionNote).toBe('could not verify the requested change');
  });

  it('a closure request starts blocked (retention period) and can still be reviewed/resolved directly', async () => {
    const id = await fileRequest('closure');
    const record = await request(server)
      .get(`/api/v1/ops/customers/${customerId}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    const row = (
      record.body.dataRequests as Array<{ id: string; status: string; blockers: unknown[] }>
    ).find((r) => r.id === id);
    expect(row?.status).toBe('blocked');
    expect(row?.blockers.length).toBeGreaterThan(0);

    const reviewed = await request(server)
      .post(`/api/v1/ops/customers/${customerId}/data-requests/${id}/review`)
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(201);
    expect(reviewed.body.status).toBe('in_review');

    // completing a closure request only records the staff decision — it does not touch the account
    const before = await request(server)
      .get(`/api/v1/ops/customers/${customerId}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    const completed = await request(server)
      .post(`/api/v1/ops/customers/${customerId}/data-requests/${id}/complete`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ notes: 'account closed manually per policy' })
      .expect(201);
    expect(completed.body.status).toBe('completed');

    const after = await request(server)
      .get(`/api/v1/ops/customers/${customerId}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(after.body.status).toBe(before.body.status);
    expect(after.body.status).not.toBe('closed');
  });

  it('a terminal request cannot be reviewed, completed or rejected again', async () => {
    const id = await fileRequest('access');
    await request(server)
      .post(`/api/v1/ops/customers/${customerId}/data-requests/${id}/complete`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ notes: 'done' })
      .expect(201);

    await request(server)
      .post(`/api/v1/ops/customers/${customerId}/data-requests/${id}/review`)
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(422)
      .expect((r) => expect(r.body.params?.reason).toBe('privacy_request_not_reviewable'));
    await request(server)
      .post(`/api/v1/ops/customers/${customerId}/data-requests/${id}/reject`)
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(422)
      .expect((r) => expect(r.body.params?.reason).toBe('privacy_request_already_final'));
  });
});
