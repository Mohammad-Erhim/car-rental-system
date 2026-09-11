import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * SCREEN-OPS-032 — Staff & roles (FR-ADM-009, FLOW-OPS-015). Covers the guards that
 * `staff.service.ts` implements but that had no integration coverage: the admin-grant guard
 * (only an administrator can hand out the `administrator` role), the last-admin self-demotion
 * guard, `staff.manage` actually gating every endpoint (not just some, in `'any'` mode with a
 * weaker permission — the recurring bug class this codebase has hit before), and the
 * invite → suspend → reactivate → deactivate staff-profile status lifecycle end to end.
 */
describe('staff & roles admin', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let adminAccountId: string;
  let agentToken: string;
  let managerToken: string;
  let configViewerToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    const admin = await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff');
    adminToken = admin.accessToken;
    adminAccountId = admin.actor.accountId;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    managerToken = (await signIn(app, 'test-manager@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    configViewerToken = (
      await signIn(app, 'test-config-viewer@example.test', 'Test-Passw0rd!', 'staff')
    ).accessToken;
  });
  afterAll(closeTestApp);

  it('staff.manage gates every endpoint — a config.read-only actor is forbidden, not just view-limited', async () => {
    // regression guard: `GET /admin/roles` used to also accept `config.read` in 'any' mode,
    // letting a config-only viewer enumerate the full permission-action catalogue.
    await request(server)
      .get('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${configViewerToken}`)
      .expect(403);
    await request(server)
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${configViewerToken}`)
      .expect(403);
    await request(server)
      .post('/api/v1/admin/staff/invite')
      .set('Authorization', `Bearer ${configViewerToken}`)
      .send({ email: 'nope@example.test', fullName: 'Nope', roleCodes: ['rental_agent'] })
      .expect(403);
  });

  it('a plain rental_agent (no staff.manage at all) is forbidden too', async () => {
    await request(server)
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(403);
  });

  it('rejects an unknown role code on invite', async () => {
    const res = await request(server)
      .post('/api/v1/admin/staff/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'staff-unknown-role@example.test',
        fullName: 'Nobody',
        roleCodes: ['not_a_real_role'],
      })
      .expect(422);
    expect(res.body.fieldErrors?.[0]?.path).toBe('roleCodes');
  });

  it('refuses to turn an existing customer email into a staff account', async () => {
    const res = await request(server)
      .post('/api/v1/admin/staff/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'test-customer@example.test',
        fullName: 'Test Customer',
        roleCodes: ['rental_agent'],
      })
      .expect(409);
    expect(res.body.code).toBe('state_conflict');
  });

  it('only an administrator can grant the administrator role — invite and change-access both enforce it', async () => {
    // test-manager has `staff.manage` (role 'manager' = ALL actions) but is not themself an
    // 'administrator' — the grant guard checks the actor's own role codes, not their action set.
    await request(server)
      .post('/api/v1/admin/staff/invite')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        email: 'staff-should-not-exist@example.test',
        fullName: 'Should Not Exist',
        roleCodes: ['administrator'],
      })
      .expect(403);

    // a non-admin invite (rental_agent) followed by a non-admin attempt to escalate it via
    // change-access is refused the same way.
    const invited = await request(server)
      .post('/api/v1/admin/staff/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'staff-escalation-test@example.test',
        fullName: 'Escalation Test',
        roleCodes: ['rental_agent'],
      })
      .expect(201);
    const accountId = invited.body.accountId as string;

    await request(server)
      .post(`/api/v1/admin/staff/${accountId}/access`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ roleCodes: ['administrator'] })
      .expect(403);

    // an actual administrator can, though — full lifecycle: suspend → reactivate → deactivate.
    let staffList = await request(server)
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(staffList.body.some((s: { accountId: string }) => s.accountId === accountId)).toBe(true);

    await request(server)
      .post(`/api/v1/admin/staff/${accountId}/access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'suspended' })
      .expect(201);
    staffList = await request(server)
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      staffList.body.find((s: { accountId: string }) => s.accountId === accountId).status,
    ).toBe('suspended');

    await request(server)
      .post(`/api/v1/admin/staff/${accountId}/access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active', roleCodes: ['rental_agent', 'finance_staff'] })
      .expect(201);
    staffList = await request(server)
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const active = staffList.body.find((s: { accountId: string }) => s.accountId === accountId);
    expect(active.status).toBe('active');
    expect(active.roleCodes.sort()).toEqual(['finance_staff', 'rental_agent']);

    await request(server)
      .post(`/api/v1/admin/staff/${accountId}/access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'deactivated' })
      .expect(201);
    staffList = await request(server)
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      staffList.body.find((s: { accountId: string }) => s.accountId === accountId).status,
    ).toBe('deactivated');
  });

  it('a role change moves the approval limit with it, not just the badge', async () => {
    const invited = await request(server)
      .post('/api/v1/admin/staff/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'staff-approval-limit-test@example.test',
        fullName: 'Approval Limit Test',
        roleCodes: ['rental_agent'],
      })
      .expect(201);
    const accountId = invited.body.accountId as string;

    const find = async () => {
      const list = await request(server)
        .get('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      return list.body.find((s: { accountId: string }) => s.accountId === accountId);
    };
    expect((await find()).approvalLimitMinor).toBe(20_000);

    await request(server)
      .post(`/api/v1/admin/staff/${accountId}/access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleCodes: ['manager'] })
      .expect(201);
    expect((await find()).approvalLimitMinor).toBe(500_000);

    await request(server)
      .post(`/api/v1/admin/staff/${accountId}/access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleCodes: ['rental_agent'] })
      .expect(201);
    expect((await find()).approvalLimitMinor).toBe(20_000);
  });

  it('an administrator cannot demote themselves out of being the last active administrator', async () => {
    const res = await request(server)
      .post(`/api/v1/admin/staff/${adminAccountId}/access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleCodes: ['manager'] })
      .expect(422);
    expect(res.body.code).toBe('business_rule_violation');
    expect(res.body.params?.reason).toBe('last_admin');

    // confirm it was in fact a no-op — still an administrator afterwards
    const staffList = await request(server)
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const self = staffList.body.find((s: { accountId: string }) => s.accountId === adminAccountId);
    expect(self.roleCodes).toContain('administrator');
  });

  it('the same last-admin guard blocks self-suspend and self-deactivate, not just role removal', async () => {
    for (const status of ['suspended', 'deactivated'] as const) {
      const res = await request(server)
        .post(`/api/v1/admin/staff/${adminAccountId}/access`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status })
        .expect(422);
      expect(res.body.code).toBe('business_rule_violation');
      expect(res.body.params?.reason).toBe('last_admin');
    }

    // still active afterwards — both attempts were no-ops
    const staffList = await request(server)
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const self = staffList.body.find((s: { accountId: string }) => s.accountId === adminAccountId);
    expect(self.status).toBe('active');
  });

  it('the guard also blocks a THIRD PARTY from suspending or demoting the last administrator — not just self-targeting', async () => {
    // test-manager has staff.manage (role 'manager' = ALL actions) but is not themself an
    // administrator, so nothing stops *them* personally from hitting zero admins — the guard has
    // to key off the target's state, not who is making the request.
    let res = await request(server)
      .post(`/api/v1/admin/staff/${adminAccountId}/access`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'deactivated' })
      .expect(422);
    expect(res.body.params?.reason).toBe('last_admin');

    res = await request(server)
      .post(`/api/v1/admin/staff/${adminAccountId}/access`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ roleCodes: ['manager'] })
      .expect(422);
    expect(res.body.params?.reason).toBe('last_admin');

    const staffList = await request(server)
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const self = staffList.body.find((s: { accountId: string }) => s.accountId === adminAccountId);
    expect(self.status).toBe('active');
    expect(self.roleCodes).toContain('administrator');
  });

  it('re-inviting an already-invited email resends the challenge without erroring', async () => {
    const first = await request(server)
      .post('/api/v1/admin/staff/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'staff-resend-test@example.test',
        fullName: 'Resend Test',
        roleCodes: ['rental_agent'],
      })
      .expect(201);
    const second = await request(server)
      .post('/api/v1/admin/staff/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'staff-resend-test@example.test',
        fullName: 'Resend Test',
        roleCodes: ['fleet_staff'],
      })
      .expect(201);
    // same underlying account, roles upserted to the latest invite payload
    expect(second.body.accountId).toBe(first.body.accountId);
    const staffList = await request(server)
      .get('/api/v1/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = staffList.body.find(
      (s: { accountId: string }) => s.accountId === first.body.accountId,
    );
    expect(row.roleCodes).toEqual(['fleet_staff']);
  });
});
