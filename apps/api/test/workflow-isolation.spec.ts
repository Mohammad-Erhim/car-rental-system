import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PasswordService } from '../src/common/auth/password.service';
import type { Actor } from '../src/common/auth/types';
import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { account, role, staffProfile, staffRoleAssignment } from '../src/database/schema/iam';
import { organization } from '../src/database/schema/org';
import { workflowBinding, workflowInstance } from '../src/database/schema/workflow';
import { WorkflowPublic } from '../src/modules/workflow/workflow.public';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

const ORIGINAL_STEP_UP = process.env.STEP_UP_MAX_AGE_SEC;
process.env.STEP_UP_MAX_AGE_SEC = '900';

/**
 * Two organisations on one deployment must never see or touch each other's workflows: definitions,
 * bindings, requests, tasks, delegations, and the people a step can address.
 */
describe('workflow isolation between organisations', () => {
  let app: Awaited<ReturnType<typeof getTestApp>>;
  let server: ReturnType<typeof httpServer>;
  let db: Database;
  let a: string; // org A administrator token
  let b: string; // org B administrator token
  let actorA: Actor;
  let actorB: Actor;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (path: string, t: string) => request(server).get(path).set(auth(t));
  const post = (path: string, body: object, t: string) =>
    request(server).post(path).set(auth(t)).send(body);
  const put = (path: string, body: object, t: string) =>
    request(server).put(path).set(auth(t)).send(body);

  const toActor = (
    accountId: string,
    name: string,
    staffProfileId: string,
    organizationId: string,
  ): Actor =>
    ({
      accountId,
      kind: 'staff',
      audience: 'staff',
      displayName: name,
      localeCode: 'en',
      staffProfileId,
      organizationId,
      permissions: [],
      roleCodes: ['administrator'],
      locationScope: [],
      permissionConditions: {},
      tokenId: 't',
    }) as Actor;

  const spec = (staffProfileId: string) => ({
    start: 'ok',
    steps: {
      ok: {
        id: 'ok',
        name: 'Approve',
        type: 'approval',
        actors: { selectors: [{ kind: 'user', staffProfileId }], mode: 'any' },
        next: null,
      },
    },
    fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
  });
  const defineAndBind = async (t: string, code: string, approver: string, actionKey: string) => {
    const made = await post(
      '/api/v1/admin/workflows/definitions',
      { code, name: code, spec: spec(approver) },
      t,
    ).expect(201);
    await post(`/api/v1/admin/workflows/definitions/${made.body.id}/publish`, {}, t).expect(201);
    await put(
      '/api/v1/admin/workflows/bindings',
      { actionKey, definitionId: made.body.id },
      t,
    ).expect(200);
    return made.body.id as string;
  };

  beforeAll(async () => {
    app = await getTestApp();
    server = httpServer(app);
    db = app.get<Database>(DB);

    // organisation B, with its own administrator
    const [orgB] = await db
      .insert(organization)
      .values({
        code: 'ORG-B',
        name: 'Org B',
        defaultCurrency: 'USD',
        defaultLocale: 'en',
        supportedLocales: ['en'],
      })
      .returning();
    const passwordHash = await app.get(PasswordService).hash('Test-Passw0rd!');
    const [accB] = await db
      .insert(account)
      .values({
        kind: 'staff',
        email: 'orgb-admin@example.test',
        emailNormalized: 'orgb-admin@example.test',
        emailVerifiedAt: new Date().toISOString(),
        passwordHash,
        status: 'active',
        displayName: 'Org B Admin',
        localeCode: 'en',
      })
      .returning();
    const [profB] = await db
      .insert(staffProfile)
      .values({
        accountId: accB!.id,
        organizationId: orgB!.id,
        locationScope: [],
        status: 'active',
      })
      .returning();
    const [adminRole] = await db.select().from(role).where(eq(role.code, 'administrator'));
    await db
      .insert(staffRoleAssignment)
      .values({ staffProfileId: profB!.id, roleId: adminRole!.id });

    a = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    b = (await signIn(app, 'orgb-admin@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    const [rowA] = await db
      .select({
        id: staffProfile.id,
        acc: staffProfile.accountId,
        org: staffProfile.organizationId,
      })
      .from(account)
      .innerJoin(staffProfile, eq(staffProfile.accountId, account.id))
      .where(eq(account.email, 'test-admin@example.test'));
    actorA = toActor(rowA!.acc, 'Test Admin', rowA!.id, rowA!.org);
    actorB = toActor(accB!.id, 'Org B Admin', profB!.id, orgB!.id);
    app
      .get(WorkflowPublic)
      .register({
        key: 'test.iso',
        subjectType: 'test_subject',
        label: 'Isolation',
        description: 'test only',
        variables: [],
        fingerprint: async () => 'fixed',
        execute: async () => ({ ok: true }),
      });
  });
  afterAll(async () => {
    if (ORIGINAL_STEP_UP === undefined) delete process.env.STEP_UP_MAX_AGE_SEC;
    else process.env.STEP_UP_MAX_AGE_SEC = ORIGINAL_STEP_UP;
    await closeTestApp();
  });

  it('each organisation sees only its own workflows, bindings and pickers', async () => {
    const idA = await defineAndBind(a, 'iso_a', actorA.staffProfileId!, 'test.iso');
    const listB = (await get('/api/v1/admin/workflows/definitions', b).expect(200)).body as Array<{
      code: string;
    }>;
    expect(listB.map((d) => d.code)).toEqual(
      expect.arrayContaining(['direct', 'two_person_review']),
    ); // its own built-ins
    expect(listB.map((d) => d.code)).not.toContain('iso_a');
    expect((await get('/api/v1/admin/workflows/bindings', b).expect(200)).body).toEqual([]);
    await get(`/api/v1/admin/workflows/definitions/${idA}`, b).expect(404);

    const opts = (await get('/api/v1/admin/workflows/options', b).expect(200)).body as {
      people: Array<{ name: string }>;
    };
    expect(opts.people.map((p) => p.name)).toEqual(['Org B Admin']); // nobody from org A
  });

  it('an organisation cannot bind, edit, publish or archive another organisation’s workflow', async () => {
    const [bindingA] = await db.select().from(workflowBinding).limit(1);
    expect(bindingA).toBeTruthy();
    await put(
      '/api/v1/admin/workflows/bindings',
      { actionKey: 'test.iso', definitionId: bindingA!.definitionId },
      b,
    ).expect(404);
    await request(server)
      .put(`/api/v1/admin/workflows/definitions/${bindingA!.definitionId}/draft`)
      .set(auth(b))
      .send({ spec: spec(actorB.staffProfileId!) })
      .expect(404);
    await post(
      `/api/v1/admin/workflows/definitions/${bindingA!.definitionId}/publish`,
      {},
      b,
    ).expect(404);
    await post(
      `/api/v1/admin/workflows/definitions/${bindingA!.definitionId}/archive`,
      {},
      b,
    ).expect(404);
    await request(server)
      .delete(`/api/v1/admin/workflows/bindings/${bindingA!.id}`)
      .set(auth(b))
      .expect(404);
    expect(
      (await db.select().from(workflowBinding).where(eq(workflowBinding.id, bindingA!.id))).length,
    ).toBe(1);
  });

  it('the same subject id in two organisations makes two separate requests; neither can read, decide, withdraw or cancel the other’s', async () => {
    await db.delete(workflowBinding);
    await defineAndBind(a, 'iso_a2', actorA.staffProfileId!, 'test.iso');
    await defineAndBind(b, 'iso_b2', actorB.staffProfileId!, 'test.iso');
    const wf = app.get(WorkflowPublic);
    const gA = await wf.gate({ actionKey: 'test.iso', subjectId: 'shared-1', actor: actorA });
    const gB = await wf.gate({ actionKey: 'test.iso', subjectId: 'shared-1', actor: actorB });
    if (gA.direct || gB.direct) throw new Error('expected requests');
    expect(gA.instanceId).not.toBe(gB.instanceId);
    expect(
      await db.select().from(workflowInstance).where(eq(workflowInstance.subjectId, 'shared-1')),
    ).toHaveLength(2);

    // A's request is invisible and untouchable from B
    await get(`/api/v1/workflows/instances/${gA.instanceId}`, b).expect(404);
    await post(`/api/v1/workflows/instances/${gA.instanceId}/withdraw`, {}, b).expect(404);
    await post(
      `/api/v1/workflows/instances/${gA.instanceId}/cancel`,
      { reason: 'not yours' },
      b,
    ).expect(404);
    await post(
      `/api/v1/workflows/instances/${gA.instanceId}/force`,
      { decision: 'approve', reason: 'not yours' },
      b,
    ).expect(404);
    const listedByB = (await get('/api/v1/workflows/instances?scope=all', b).expect(200))
      .body as Array<{ instanceId: string }>;
    expect(listedByB.map((i) => i.instanceId)).toEqual([gB.instanceId]);

    // B's task can only be decided by B
    const inboxB = (await get('/api/v1/workflows/inbox', b).expect(200)).body.items as Array<{
      taskId: string;
    }>;
    const inboxA = (await get('/api/v1/workflows/inbox', a).expect(200)).body.items as Array<{
      taskId: string;
    }>;
    expect(inboxB).toHaveLength(1);
    expect(inboxA.map((i) => i.taskId)).not.toContain(inboxB[0]!.taskId);
    await post(
      `/api/v1/workflows/tasks/${inboxB[0]!.taskId}/decide`,
      { decision: 'approve' },
      a,
    ).expect(404);
    await post(
      `/api/v1/workflows/tasks/${inboxB[0]!.taskId}/reassign`,
      { toStaffProfileId: actorA.staffProfileId },
      a,
    ).expect(404);
  });

  it('a workflow bound in one organisation does not govern another’s actions', async () => {
    await db.delete(workflowBinding);
    await defineAndBind(b, 'iso_b3', actorB.staffProfileId!, 'config.version.publish');
    const d = await post(
      '/api/v1/ops/config/versions',
      { kind: 'policy', key: 'cancellation', payload: { freeCancelHours: 44, lateFeeBps: 1000 } },
      a,
    ).expect(201);
    const res = await post(`/api/v1/ops/config/versions/${d.body.id}/approve`, {}, a).expect(201);
    expect(res.body.state).toBe('published'); // A is still Direct
    expect(res.body.workflow).toBeUndefined();
  });

  it('delegation cannot cross organisations', async () => {
    await post(
      '/api/v1/workflows/delegations',
      {
        delegateStaffProfileId: actorB.staffProfileId,
        validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      },
      a,
    )
      .expect(422)
      .expect((r) => expect(r.body.params.reason).toBe('delegate_inactive'));
    const peopleA = (await get('/api/v1/workflows/delegations/people', a).expect(200))
      .body as Array<{ name: string }>;
    expect(peopleA.map((p) => p.name)).not.toContain('Org B Admin');
  });
});
