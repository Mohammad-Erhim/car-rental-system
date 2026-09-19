import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PermissionCatalogueService } from '../src/common/auth/permission-catalogue.service';
import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { account, permissionAction, staffProfile } from '../src/database/schema/iam';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

// the test environment sets a 1-second step-up window (so step-up specs can expire it); these specs
// are about access rules, not re-authentication, so give them a realistic one
const ORIGINAL_STEP_UP = process.env.STEP_UP_MAX_AGE_SEC;
process.env.STEP_UP_MAX_AGE_SEC = '900';

const isoIn = (days: number, hour = 15) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

/**
 * Access administration: editable roles, the permission matrix, per-person assignments and
 * overrides, teams — and the guard rails around them (no escalation, no self-change, locked system
 * roles, honest validation).
 */
describe('access administration', () => {
  let server: ReturnType<typeof httpServer>;
  let db: Database;
  let admin: string; // administrator — holds every permission
  let manager: string; // holds everything except payment.manage / email.manage
  let agent: string; // rental agent
  let customer: string;
  const ids: Record<string, string> = {};
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (path: string, t = admin) => request(server).get(path).set(auth(t));
  const post = (path: string, body: object = {}, t = admin) =>
    request(server).post(path).set(auth(t)).send(body);

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    db = app.get<Database>(DB);
    const login = async (email: string, aud: 'staff' | 'customer' = 'staff') =>
      (await signIn(app, email, 'Test-Passw0rd!', aud)).accessToken;
    admin = await login('test-admin@example.test');
    manager = await login('test-manager@example.test');
    agent = await login('test-agent@example.test');
    customer = await login('test-customer@example.test', 'customer');
    for (const [k, email] of Object.entries({
      admin: 'test-admin@example.test',
      manager: 'test-manager@example.test',
      agent: 'test-agent@example.test',
    })) {
      const [row] = await db
        .select({ id: account.id })
        .from(account)
        .where(eq(account.emailNormalized, email));
      ids[k] = row!.id;
    }
  });
  afterAll(async () => {
    // the environment is shared by the spec files that run after this one — put it back
    if (ORIGINAL_STEP_UP === undefined) delete process.env.STEP_UP_MAX_AGE_SEC;
    else process.env.STEP_UP_MAX_AGE_SEC = ORIGINAL_STEP_UP;
    await closeTestApp();
  });

  describe('roles', () => {
    it('lists system roles as locked, with who holds them and the live catalogue', async () => {
      const res = await get('/api/v1/admin/roles').expect(200);
      const admins = res.body.roles.find((r: { code: string }) => r.code === 'administrator');
      expect(admins).toMatchObject({ isSystem: true, locked: true, permissionActions: ['*'] });
      expect(admins.holderCount).toBeGreaterThanOrEqual(1);
      expect(res.body.permissionActions.map((a: { code: string }) => a.code)).toContain(
        'payment.refund',
      );
      // the two permissions no endpoint ever checked are gone
      const codes = res.body.permissionActions.map((a: { code: string }) => a.code);
      expect(codes).not.toContain('rental.extend.approve');
      expect(codes).not.toContain('reservation.override');
    });

    it('only people who can manage staff may read or write access', async () => {
      await get('/api/v1/admin/roles', agent).expect(403);
      await get('/api/v1/admin/roles', customer).expect(403);
      await post(
        '/api/v1/admin/roles',
        { code: 'nope', name: 'Nope', permissionActions: [] },
        agent,
      ).expect(403);
      await request(server).get('/api/v1/admin/roles').expect(401);
    });

    it('creates a custom role, rejects bad input, and refuses duplicates', async () => {
      const ok = await post('/api/v1/admin/roles', {
        code: 'desk_lead',
        name: 'Desk lead',
        description: 'Runs the counter',
        permissionActions: ['reservation.read', 'rental.read', 'report.read'],
      }).expect(201);
      expect(ok.body).toMatchObject({
        code: 'desk_lead',
        isSystem: false,
        locked: false,
        holderCount: 0,
      });

      const unknown = await post('/api/v1/admin/roles', {
        code: 'typo_role',
        name: 'Typo',
        permissionActions: ['reservation.reed'],
      }).expect(422);
      expect(unknown.body.fieldErrors[0]).toMatchObject({
        path: 'permissionActions.0',
        code: 'unknown_action',
      });

      const wildcard = await post('/api/v1/admin/roles', {
        code: 'wild',
        name: 'Wild',
        permissionActions: ['*'],
      }).expect(422);
      expect(wildcard.body.fieldErrors[0].code).toBe('wildcard_not_allowed');

      await post('/api/v1/admin/roles', {
        code: 'Bad Code!',
        name: 'x',
        permissionActions: [],
      }).expect(422);
      await post('/api/v1/admin/roles', {
        code: 'desk_lead',
        name: 'Again',
        permissionActions: [],
      }).expect(409);
      await post('/api/v1/admin/roles', {
        code: 'administrator',
        name: 'Clash',
        permissionActions: [],
      }).expect(409);
    });

    it('system roles are read-only but can be cloned; the clone is fully editable', async () => {
      const denied = await request(server)
        .patch('/api/v1/admin/roles/rental_agent')
        .set(auth(admin))
        .send({ name: 'Hacked' })
        .expect(403);
      expect(denied.body.params?.reason).toBe('role_locked');
      await post('/api/v1/admin/roles/rental_agent/archive').expect(403);

      const clone = await post('/api/v1/admin/roles/rental_agent/clone', {
        code: 'agent_plus',
        name: 'Agent plus',
      }).expect(201);
      expect(clone.body.permissionActions).toEqual(
        expect.arrayContaining(['reservation.read', 'rental.pickup']),
      );
      const edited = await request(server)
        .patch('/api/v1/admin/roles/agent_plus')
        .set(auth(admin))
        .send({
          permissionActions: [...clone.body.permissionActions, 'fleet.manage'],
          expectedVersion: clone.body.version,
        })
        .expect(200);
      expect(edited.body.permissionActions).toContain('fleet.manage');
      expect(edited.body.version).toBe(clone.body.version + 1);
      // optimistic concurrency: a stale editor is told so
      await request(server)
        .patch('/api/v1/admin/roles/agent_plus')
        .set(auth(admin))
        .send({ name: 'Stale', expectedVersion: clone.body.version })
        .expect(409);
    });

    it('nobody can hand out power they do not hold (no privilege escalation)', async () => {
      // the manager lacks payment.manage / email.manage
      const create = await post(
        '/api/v1/admin/roles',
        { code: 'esc_role', name: 'Esc', permissionActions: ['payment.manage'] },
        manager,
      ).expect(403);
      expect(create.body.params?.reason).toBe('privilege_escalation');
      await post(
        '/api/v1/admin/roles/administrator/clone',
        { code: 'admin_copy', name: 'Copy' },
        manager,
      ).expect(403);
      await post(
        `/api/v1/admin/staff/${ids.agent}/assignments`,
        { roleCode: 'administrator' },
        manager,
      ).expect(403);
      // a manager can grant what a manager holds
      await post(
        `/api/v1/admin/staff/${ids.agent}/assignments`,
        { roleCode: 'desk_lead', reason: 'cover' },
        manager,
      ).expect(201);
      await request(server)
        .delete(
          `/api/v1/admin/staff/${ids.agent}/assignments/${(await get(`/api/v1/admin/staff/${ids.agent}/access`)).body.assignments.find((a: { roleCode: string }) => a.roleCode === 'desk_lead').id}`,
        )
        .set(auth(manager))
        .expect(200);
    });

    it('an in-use role cannot be archived; an unused one can, and comes back', async () => {
      const held = await post(`/api/v1/admin/staff/${ids.agent}/assignments`, {
        roleCode: 'agent_plus',
      }).expect(201);
      const inUse = await post('/api/v1/admin/roles/agent_plus/archive').expect(422);
      expect(inUse.body.params).toMatchObject({ reason: 'role_in_use', holders: 1 });
      const assignment = held.body.assignments.find(
        (a: { roleCode: string }) => a.roleCode === 'agent_plus',
      );
      await request(server)
        .delete(`/api/v1/admin/staff/${ids.agent}/assignments/${assignment.id}`)
        .set(auth(admin))
        .expect(200);
      const archived = await post('/api/v1/admin/roles/agent_plus/archive').expect(201);
      expect(archived.body.archived).toBe(true);
      // an archived role cannot be assigned
      await post(`/api/v1/admin/staff/${ids.agent}/assignments`, { roleCode: 'agent_plus' }).expect(
        422,
      );
      const restored = await post('/api/v1/admin/roles/agent_plus/restore').expect(201);
      expect(restored.body.archived).toBe(false);
    });
  });

  describe('the permission matrix', () => {
    it('dry-run shows exactly what would change and who is affected, without changing anything', async () => {
      const before = (await get('/api/v1/admin/roles')).body.roles.find(
        (r: { code: string }) => r.code === 'desk_lead',
      );
      const preview = await request(server)
        .put('/api/v1/admin/permissions/matrix')
        .set(auth(admin))
        .send({
          dryRun: true,
          changes: [
            {
              roleCode: 'desk_lead',
              add: ['fleet.read', 'rental.read'],
              remove: ['report.read', 'catalogue.manage'],
            },
          ],
        })
        .expect(200);
      expect(preview.body.applied).toBe(false);
      expect(preview.body.changes[0]).toMatchObject({
        roleCode: 'desk_lead',
        added: ['fleet.read'],
        removed: ['report.read'],
      });
      const after = (await get('/api/v1/admin/roles')).body.roles.find(
        (r: { code: string }) => r.code === 'desk_lead',
      );
      expect(after.permissionActions).toEqual(before.permissionActions);
    });

    it('applies the change, refuses system roles, unknown actions and duplicate roles', async () => {
      const applied = await request(server)
        .put('/api/v1/admin/permissions/matrix')
        .set(auth(admin))
        .send({
          changes: [{ roleCode: 'desk_lead', add: ['fleet.read'], remove: ['report.read'] }],
        })
        .expect(200);
      expect(applied.body.applied).toBe(true);
      const row = (await get('/api/v1/admin/roles')).body.roles.find(
        (r: { code: string }) => r.code === 'desk_lead',
      );
      expect(row.permissionActions).toEqual(expect.arrayContaining(['fleet.read']));
      expect(row.permissionActions).not.toContain('report.read');

      const put = (body: object, t = admin) =>
        request(server).put('/api/v1/admin/permissions/matrix').set(auth(t)).send(body);
      await put({ changes: [{ roleCode: 'manager', remove: ['fleet.read'] }] }).expect(403);
      await put({ changes: [{ roleCode: 'desk_lead', add: ['not.a.thing'] }] }).expect(422);
      await put({
        changes: [
          { roleCode: 'desk_lead', add: [] },
          { roleCode: 'desk_lead', add: [] },
        ],
      }).expect(422);
      await put({ changes: [{ roleCode: 'ghost', add: [] }] }).expect(404);
      await put({ changes: [{ roleCode: 'desk_lead', add: ['payment.manage'] }] }, manager).expect(
        403,
      );
    });

    it('removing an action also drops its limit', async () => {
      await post('/api/v1/admin/roles', {
        code: 'tiny_refunds',
        name: 'Tiny refunds',
        permissionActions: ['payment.refund', 'payment.read'],
        conditions: { 'payment.refund': { amountMinorMax: 100 } },
      }).expect(201);
      await request(server)
        .put('/api/v1/admin/permissions/matrix')
        .set(auth(admin))
        .send({ changes: [{ roleCode: 'tiny_refunds', remove: ['payment.refund'] }] })
        .expect(200);
      const row = (await get('/api/v1/admin/roles')).body.roles.find(
        (r: { code: string }) => r.code === 'tiny_refunds',
      );
      expect(row.conditions).toEqual({});
    });
  });

  describe('a person’s roles and overrides', () => {
    it('a time-bound role is effective while active, shown as scheduled before it starts', async () => {
      const soon = new Date(Date.now() + 3600_000).toISOString();
      const later = new Date(Date.now() + 7200_000).toISOString();
      const res = await post(`/api/v1/admin/staff/${ids.agent}/assignments`, {
        roleCode: 'desk_lead',
        validFrom: soon,
        validUntil: later,
      }).expect(201);
      const a = res.body.assignments.find(
        (x: { roleCode: string; state: string }) => x.roleCode === 'desk_lead',
      );
      expect(a.state).toBe('scheduled');
      expect(res.body.effective.roleCodes).not.toContain('desk_lead');
      await request(server)
        .delete(`/api/v1/admin/staff/${ids.agent}/assignments/${a.id}`)
        .set(auth(admin))
        .expect(200);
    });

    it('validates dates: an end in the past, or before the start, is refused', async () => {
      await post(`/api/v1/admin/staff/${ids.agent}/assignments`, {
        roleCode: 'desk_lead',
        validUntil: new Date(Date.now() - 1000).toISOString(),
      }).expect(422);
      await post(`/api/v1/admin/staff/${ids.agent}/assignments`, {
        roleCode: 'desk_lead',
        validFrom: isoIn(3),
        validUntil: isoIn(2),
      }).expect(422);
    });

    it('you cannot change your own access', async () => {
      const own = await post(`/api/v1/admin/staff/${ids.admin}/assignments`, {
        roleCode: 'desk_lead',
      }).expect(403);
      expect(own.body.params?.reason).toBe('self_change');
      await post(`/api/v1/admin/staff/${ids.admin}/overrides`, {
        action: 'report.read',
        effect: 'deny',
        reason: 'test',
      }).expect(403);
    });

    it('a DENY override removes a permission the roles grant — and the API stops honouring it at once', async () => {
      await get('/api/v1/ops/fleet/units', agent).expect(200);
      const denied = await post(`/api/v1/admin/staff/${ids.agent}/overrides`, {
        action: 'fleet.read',
        effect: 'deny',
        reason: 'under investigation',
      }).expect(201);
      expect(denied.body.effective.permissions).not.toContain('fleet.read');
      expect(denied.body.effective.denied).toContain('fleet.read');
      await get('/api/v1/ops/fleet/units', agent).expect(403);
      // "my access" tells the truth immediately (the session copy would be stale)
      const mine = await get('/api/v1/auth/me/access', agent).expect(200);
      expect(mine.body.permissions).not.toContain('fleet.read');
      // explain why
      const why = await get(`/api/v1/admin/staff/${ids.agent}/explain?action=fleet.read`).expect(
        200,
      );
      expect(why.body).toMatchObject({ allowed: false, reason: 'denied by an override' });
      // lift it
      const ov = denied.body.overrides.find((o: { action: string }) => o.action === 'fleet.read');
      await request(server)
        .delete(`/api/v1/admin/staff/${ids.agent}/overrides/${ov.id}`)
        .set(auth(admin))
        .expect(200);
      await get('/api/v1/ops/fleet/units', agent).expect(200);
    });

    it('an ALLOW override adds one permission without a role; only what the granter holds', async () => {
      await get('/api/v1/ops/audit', agent).expect(403);
      const allowed = await post(`/api/v1/admin/staff/${ids.agent}/overrides`, {
        action: 'audit.read',
        effect: 'allow',
        reason: 'audit support',
        validUntil: new Date(Date.now() + 86400_000).toISOString(),
      }).expect(201);
      expect(allowed.body.effective.permissions).toContain('audit.read');
      await get('/api/v1/ops/audit', agent).expect(200);
      await post(
        `/api/v1/admin/staff/${ids.agent}/overrides`,
        { action: 'payment.manage', effect: 'allow', reason: 'nope' },
        manager,
      ).expect(403);
      await post(`/api/v1/admin/staff/${ids.agent}/overrides`, {
        action: 'not.real',
        effect: 'allow',
        reason: 'nope',
      }).expect(422);
      await post(`/api/v1/admin/staff/${ids.agent}/overrides`, {
        action: 'audit.read',
        effect: 'allow',
        reason: 'x',
      }).expect(422); // reason too short
      const ov = allowed.body.overrides.find((o: { action: string }) => o.action === 'audit.read');
      await request(server)
        .delete(`/api/v1/admin/staff/${ids.agent}/overrides/${ov.id}`)
        .set(auth(admin))
        .expect(200);
      await get('/api/v1/ops/audit', agent).expect(403);
    });

    it('unknown people, assignments and overrides are 404s', async () => {
      await get('/api/v1/admin/staff/00000000-0000-0000-0000-000000000000/access').expect(404);
      await request(server)
        .delete(`/api/v1/admin/staff/${ids.agent}/assignments/00000000-0000-0000-0000-000000000000`)
        .set(auth(admin))
        .expect(404);
      await request(server)
        .delete(`/api/v1/admin/staff/${ids.agent}/overrides/00000000-0000-0000-0000-000000000000`)
        .set(auth(admin))
        .expect(404);
    });
  });

  describe('refund limits are enforced', () => {
    it('a role’s amount limit caps what its holders may refund', async () => {
      await post('/api/v1/admin/roles', {
        code: 'small_refunds',
        name: 'Small refunds',
        permissionActions: ['payment.refund', 'reservation.read', 'payment.read'],
        conditions: { 'payment.refund': { amountMinorMax: 100 } },
      }).expect(201);
      await post(`/api/v1/admin/staff/${ids.agent}/assignments`, {
        roleCode: 'small_refunds',
      }).expect(201);
      const quote = await request(server)
        .post('/api/v1/discovery/quote')
        .send({
          pickupLocationCode: 'TST1',
          pickupAt: isoIn(45),
          returnAt: isoIn(48),
          categoryCode: 'economy',
          holderKey: `acc-${Math.random().toString(36).slice(2)}`,
        })
        .expect(201);
      const booked = await request(server)
        .post('/api/v1/bookings/confirm')
        .set(auth(customer))
        .send({
          quoteReference: quote.body.reference,
          drivers: [{ role: 'primary_renter', fullName: 'Limit Test', email: 'lt@example.test' }],
          acceptTerms: true,
          paymentToken: 'tok_ok',
        })
        .expect(201);
      const ref = booked.body.reference as string;
      // an unlimited holder refunds freely
      await request(server)
        .post(`/api/v1/ops/reservations/${ref}/refund`)
        .set(auth(admin))
        .send({ amountMinor: 300, note: 'bigger' })
        .expect(201);
      // a limited holder is refused above the limit — before anything moves
      const over = await request(server)
        .post(`/api/v1/ops/reservations/${ref}/refund`)
        .set(auth(agent))
        .send({ amountMinor: 500, note: 'too much' })
        .expect(403);
      expect(over.body.params).toMatchObject({ reason: 'over_limit', limitMinor: 100 });
      // …and within the limit the limit rule no longer applies (any refusal is a business rule, not the cap)
      const within = await request(server)
        .post(`/api/v1/ops/reservations/${ref}/refund`)
        .set(auth(agent))
        .send({ amountMinor: 50, note: 'goodwill' });
      expect(within.body.params?.reason).not.toBe('over_limit');
      // the list shows the limit
      const list = await get('/api/v1/admin/staff').expect(200);
      expect(
        list.body.find((s: { accountId: string }) => s.accountId === ids.agent).refundLimitMinor,
      ).toBe(100);
    });

    it('limits only make sense on limitable actions, and only for granted ones', async () => {
      const r1 = await post('/api/v1/admin/roles', {
        code: 'bad_cond1',
        name: 'x',
        permissionActions: ['reservation.read'],
        conditions: { 'reservation.read': { amountMinorMax: 5 } },
      }).expect(422);
      expect(r1.body.fieldErrors[0].code).toBe('not_supported');
      const r2 = await post('/api/v1/admin/roles', {
        code: 'bad_cond2',
        name: 'x',
        permissionActions: ['reservation.read'],
        conditions: { 'payment.refund': { amountMinorMax: 5 } },
      }).expect(422);
      expect(r2.body.fieldErrors[0].code).toBe('action_not_granted');
    });
  });

  describe('views and lookups', () => {
    it('the users matrix shows every staff member’s effective permissions with sources', async () => {
      const res = await get('/api/v1/admin/access/users-matrix').expect(200);
      const admins = res.body.staff.find((s: { accountId: string }) => s.accountId === ids.admin);
      expect(admins.permissions).toContain('payment.manage');
      expect(admins.via['payment.manage']).toEqual(['System administrator']);
      const agents = res.body.staff.find((s: { accountId: string }) => s.accountId === ids.agent);
      expect(agents.permissions).not.toContain('payment.manage');
    });

    it('who-can lists exactly the holders, active only', async () => {
      const res = await get('/api/v1/admin/access/who-can?action=payment.manage').expect(200);
      const emails = res.body.map((p: { email: string }) => p.email);
      expect(emails).toContain('test-admin@example.test');
      expect(emails).not.toContain('test-manager@example.test');
      await get('/api/v1/admin/access/who-can?action=nope').expect(422);
    });

    it('the access history records who changed what, and can be filtered to one person', async () => {
      const all = await get('/api/v1/admin/access/history?limit=100').expect(200);
      const actions = all.body.map((e: { action: string }) => e.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'iam.role.created',
          'iam.role.updated',
          'iam.access.role_assigned',
          'iam.access.override_set',
        ]),
      );
      const mine = await get(`/api/v1/admin/access/history?accountId=${ids.agent}`).expect(200);
      expect(mine.body.length).toBeGreaterThan(0);
      expect(mine.body.every((e: { targetId: string }) => e.targetId === ids.agent)).toBe(true);
      // people are shown by name, not by id
      expect(mine.body[0].targetLabel).toBe('Test Agent');
    });
  });

  describe('teams', () => {
    it('creates, edits members, archives and restores a team', async () => {
      const created = await post('/api/v1/admin/groups', {
        code: 'fleet_desk',
        name: 'Fleet desk',
        accountIds: [ids.agent, ids.manager],
      }).expect(201);
      expect(created.body.members).toHaveLength(2);
      await post('/api/v1/admin/groups', { code: 'fleet_desk', name: 'Again' }).expect(409);
      const edited = await request(server)
        .put('/api/v1/admin/groups/fleet_desk')
        .set(auth(admin))
        .send({ code: 'fleet_desk', name: 'Fleet desk (renamed)', accountIds: [ids.agent] })
        .expect(200);
      expect(edited.body).toMatchObject({ name: 'Fleet desk (renamed)' });
      expect(edited.body.members).toHaveLength(1);
      await request(server)
        .put('/api/v1/admin/groups/fleet_desk')
        .set(auth(admin))
        .send({
          code: 'fleet_desk',
          name: 'x',
          accountIds: ['00000000-0000-0000-0000-000000000000'],
        })
        .expect(422);
      const access = await get(`/api/v1/admin/staff/${ids.agent}/access`).expect(200);
      expect(access.body.groups.map((g: { code: string }) => g.code)).toContain('fleet_desk');
      await post('/api/v1/admin/groups/fleet_desk/archive').expect(201);
      const list = await get('/api/v1/admin/groups').expect(200);
      expect(list.body.find((g: { code: string }) => g.code === 'fleet_desk').archived).toBe(true);
      await post('/api/v1/admin/groups/fleet_desk/restore').expect(201);
      await post('/api/v1/admin/groups/ghost/archive').expect(404);
    });
  });

  describe('accounts limited to specific locations', () => {
    it('can still see the role list (to invite people) but not the organisation-wide access tools', async () => {
      await db
        .update(staffProfile)
        .set({ locationScope: ['TST2'] })
        .where(eq(staffProfile.accountId, ids.manager));
      try {
        await get('/api/v1/admin/roles', manager).expect(200);
        for (const path of [
          '/api/v1/admin/access/users-matrix',
          '/api/v1/admin/groups',
          `/api/v1/admin/staff/${ids.agent}/access`,
          '/api/v1/admin/access/history',
        ]) {
          const r = await get(path, manager).expect(403);
          expect(r.body.title).toMatch(/whole organisation/i);
        }
        await post(
          '/api/v1/admin/roles',
          { code: 'scoped_role', name: 'x', permissionActions: [] },
          manager,
        ).expect(403);
      } finally {
        await db
          .update(staffProfile)
          .set({ locationScope: [] })
          .where(eq(staffProfile.accountId, ids.manager));
      }
    });
  });

  describe('the catalogue can never drift from the code', () => {
    it('every action an endpoint requires exists in the permission catalogue', async () => {
      const app = await getTestApp();
      const used = app.get(PermissionCatalogueService).discoverActions();
      expect(used.length).toBeGreaterThan(15);
      const inDb = new Set(
        (await db.select({ code: permissionAction.code }).from(permissionAction)).map(
          (r) => r.code,
        ),
      );
      expect(used.filter((a) => !inDb.has(a))).toEqual([]);
    });
  });

  describe('staff who cannot sign in yet, and the last administrator', () => {
    it('roles a person holds come from assignments — an invite creates them, an unknown role is refused', async () => {
      const invited = await post('/api/v1/admin/staff/invite', {
        email: 'assign-check@example.test',
        fullName: 'Assign Check',
        roleCodes: ['desk_lead'],
      }).expect(201);
      const access = await get(`/api/v1/admin/staff/${invited.body.accountId}/access`).expect(200);
      expect(access.body.assignments.map((a: { roleCode: string }) => a.roleCode)).toEqual([
        'desk_lead',
      ]);
      await post('/api/v1/admin/staff/invite', {
        email: 'assign-check2@example.test',
        fullName: 'X',
        roleCodes: ['nope'],
      }).expect(422);
      // an invited (not yet active) person holds nothing until they activate
      const [profile] = await db
        .select({ status: staffProfile.status })
        .from(staffProfile)
        .where(eq(staffProfile.accountId, invited.body.accountId));
      expect(profile!.status).toBe('invited');
    });
  });
});
