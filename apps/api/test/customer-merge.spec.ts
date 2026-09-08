import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * FR-ADM-001 — duplicate review + **reversible** merge. Fold a duplicate customer into a
 * survivor: its saved drivers + eligibility restrictions move, it is marked `merged` (not
 * deleted), and `unmerge` puts everything back. `customer.manage` gates both.
 */
describe('reversible customer merge (FR-ADM-001)', () => {
  let server: ReturnType<typeof httpServer>;
  let admin: string;
  let manager: string;
  let agent: string;
  let survivorId: string;
  let dupId: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    admin = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    manager = (await signIn(app, 'test-manager@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agent = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff')).accessToken;

    const found = await request(server)
      .get('/api/v1/ops/customers?q=Test%20Customer')
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    const rows = found.body.results as Array<{ id: string; fullName: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(2);
    dupId = rows.find((r) => r.fullName === 'Test Customer II')!.id;
    survivorId = rows.find((r) => r.fullName === 'Test Customer')!.id;
  });
  afterAll(closeTestApp);

  it('a rental agent cannot merge', async () => {
    await request(server)
      .post(`/api/v1/ops/customers/${dupId}/merge`)
      .set('Authorization', `Bearer ${agent}`)
      .send({ intoId: survivorId })
      .expect(403);
  });

  it('a customer cannot be merged into itself', async () => {
    await request(server)
      .post(`/api/v1/ops/customers/${dupId}/merge`)
      .set('Authorization', `Bearer ${manager}`)
      .send({ intoId: dupId })
      .expect(422)
      .expect((r) => expect(r.body.params?.reason).toBe('same_customer'));
  });

  it('merge moves the duplicate’s restriction to the survivor; unmerge restores it', async () => {
    // put an approved block restriction on the duplicate
    const created = await request(server)
      .post(`/api/v1/ops/customers/${dupId}/restrictions`)
      .set('Authorization', `Bearer ${manager}`)
      .send({ category: 'block', scope: 'all' })
      .expect(201);
    await request(server)
      .post(`/api/v1/ops/customers/${dupId}/restrictions/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${admin}`)
      .send({})
      .expect(201);

    const merged = await request(server)
      .post(`/api/v1/ops/customers/${dupId}/merge`)
      .set('Authorization', `Bearer ${manager}`)
      .send({ intoId: survivorId, reason: 'same person, two sign-ups' })
      .expect(201);
    expect(merged.body.movedRestrictions).toBe(1);

    // the duplicate is marked merged, not deleted
    const dup = await request(server)
      .get(`/api/v1/ops/customers/${dupId}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(dup.body.status).toBe('merged');
    expect(dup.body.mergedIntoId).toBe(survivorId);

    // the survivor now carries the restriction + a merge-history entry
    const surv = await request(server)
      .get(`/api/v1/ops/customers/${survivorId}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(surv.body.restrictions.some((x: { scope: string }) => x.scope === 'all')).toBe(true);
    expect(surv.body.mergeHistory).toHaveLength(1);
    expect(surv.body.mergeHistory[0].mergedId).toBe(dupId);

    // unmerge — restriction goes back, duplicate is active again
    await request(server)
      .post(`/api/v1/ops/customers/${survivorId}/unmerge`)
      .set('Authorization', `Bearer ${manager}`)
      .expect(201);

    const dupAfter = await request(server)
      .get(`/api/v1/ops/customers/${dupId}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(dupAfter.body.status).toBe('active');
    expect(dupAfter.body.mergedIntoId).toBeNull();
    expect(dupAfter.body.restrictions.some((x: { scope: string }) => x.scope === 'all')).toBe(true);

    const survAfter = await request(server)
      .get(`/api/v1/ops/customers/${survivorId}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(survAfter.body.restrictions).toHaveLength(0);
    expect(survAfter.body.mergeHistory[0].reversedAt).toBeTruthy();
  });
});
