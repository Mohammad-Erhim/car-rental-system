import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Actor } from '../src/common/auth/types';
import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { configVersion } from '../src/database/schema/admin';
import { account, role, staffProfile } from '../src/database/schema/iam';
import { template } from '../src/database/schema/notify';
import {
  workflowBinding,
  workflowEvent,
  workflowInstance,
  workflowTask,
  workflowTaskAssignee,
} from '../src/database/schema/workflow';
import { WorkflowPublic } from '../src/modules/workflow/workflow.public';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

const ORIGINAL_STEP_UP = process.env.STEP_UP_MAX_AGE_SEC;
process.env.STEP_UP_MAX_AGE_SEC = '900';

/**
 * The edge cases the plan decided up front (plan §4) that the main workflow specs do not already
 * name: a definition edited while requests run, a request withdrawn from a step that forbids it, an
 * archived workflow with requests in flight, a missing variable in a rule, a client retry, a role
 * with far too many people, and an item edited while it waits.
 */
describe('workflow edge cases (plan §4)', () => {
  let app: Awaited<ReturnType<typeof getTestApp>>;
  let server: ReturnType<typeof httpServer>;
  let db: Database;
  let tok: Record<'admin' | 'manager' | 'finance' | 'agent', string>;
  const sid = {} as Record<'admin' | 'manager' | 'finance' | 'agent', string>;
  const aid = {} as Record<'admin' | 'manager' | 'finance' | 'agent', string>;
  let orgId: string;
  let n = 0;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (path: string, t = tok.admin) => request(server).get(path).set(auth(t));
  const post = (path: string, body: object = {}, t = tok.admin) =>
    request(server).post(path).set(auth(t)).send(body);
  const put = (path: string, body: object, t = tok.admin) =>
    request(server).put(path).set(auth(t)).send(body);
  const user = (name: keyof typeof sid) => ({ kind: 'user', staffProfileId: sid[name] });
  const step = (id: string, selectors: object[], extra: Record<string, unknown> = {}) => ({
    id,
    name: `Step ${id}`,
    type: 'approval',
    actors: { selectors, mode: 'any' },
    next: null,
    ...extra,
  });
  const spec = (steps: object[], extra: Record<string, unknown> = {}) => ({
    start: (steps[0] as { id: string }).id,
    steps: Object.fromEntries(steps.map((s) => [(s as { id: string }).id, s])),
    fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
    ...extra,
  });
  const inbox = async (t: string) =>
    (await get('/api/v1/workflows/inbox?limit=100', t).expect(200)).body.items as Array<{
      taskId: string;
      subjectId: string;
    }>;
  const actorOf = (): Actor =>
    ({
      accountId: aid.admin,
      kind: 'staff',
      audience: 'staff',
      displayName: 'Test Admin',
      localeCode: 'en',
      staffProfileId: sid.admin,
      organizationId: orgId,
      permissions: [],
      roleCodes: ['administrator'],
      locationScope: [],
      permissionConditions: {},
      tokenId: 't',
    }) as Actor;

  const publishDef = async (s: object, actionKey?: string) => {
    const code = `edge_${Date.now().toString(36)}_${n++}`;
    const made = await post('/api/v1/admin/workflows/definitions', {
      code,
      name: code,
      spec: s,
    }).expect(201);
    await post(`/api/v1/admin/workflows/definitions/${made.body.id}/publish`).expect(201);
    if (actionKey)
      await put('/api/v1/admin/workflows/bindings', {
        actionKey,
        definitionId: made.body.id,
      }).expect(200);
    return made.body.id as string;
  };
  const draftPolicy = async () =>
    (
      await post('/api/v1/ops/config/versions', {
        kind: 'policy',
        key: 'cancellation',
        payload: { freeCancelHours: 40 + n++, lateFeeBps: 1000 },
      }).expect(201)
    ).body.id as string;
  const request_ = (id: string) => post(`/api/v1/ops/config/versions/${id}/approve`).expect(201);
  const stateOf = async (id: string) =>
    (await db.select().from(configVersion).where(eq(configVersion.id, id)))[0]!.state;

  beforeAll(async () => {
    app = await getTestApp();
    server = httpServer(app);
    db = app.get<Database>(DB);
    const login = async (email: string) =>
      (await signIn(app, email, 'Test-Passw0rd!', 'staff')).accessToken;
    tok = {
      admin: await login('test-admin@example.test'),
      manager: await login('test-manager@example.test'),
      finance: await login('test-finance@example.test'),
      agent: await login('test-agent@example.test'),
    };
    for (const name of ['admin', 'manager', 'finance', 'agent'] as const) {
      const [row] = await db
        .select({ sid: staffProfile.id, aid: account.id, org: staffProfile.organizationId })
        .from(account)
        .innerJoin(staffProfile, eq(staffProfile.accountId, account.id))
        .where(eq(account.email, `test-${name}@example.test`));
      sid[name] = row!.sid;
      aid[name] = row!.aid;
      orgId = row!.org;
    }
    const wf = app.get(WorkflowPublic);
    wf.register({
      key: 'test.vars',
      subjectType: 'test_subject',
      label: 'Vars',
      description: 'test only',
      variables: ['x'],
      fingerprint: async () => 'f',
      execute: async () => ({ ok: true }),
    });
    wf.register({
      key: 'test.retry',
      subjectType: 'test_subject',
      label: 'Retry',
      description: 'test only',
      variables: [],
      fingerprint: async () => 'f',
      execute: async () => ({ ok: true }),
    });
    wf.register({
      key: 'test.many',
      subjectType: 'test_subject',
      label: 'Many',
      description: 'test only',
      variables: [],
      fingerprint: async () => 'f',
      execute: async () => ({ ok: true }),
    });
  });
  afterAll(async () => {
    if (ORIGINAL_STEP_UP === undefined) delete process.env.STEP_UP_MAX_AGE_SEC;
    else process.env.STEP_UP_MAX_AGE_SEC = ORIGINAL_STEP_UP;
    await closeTestApp();
  });
  beforeEach(async () => {
    await db.delete(workflowBinding);
  });

  it('#4 editing a workflow never changes a request already running on it; new requests use the new version', async () => {
    const defId = await publishDef(spec([step('a', [user('manager')])]), 'config.version.publish');
    const running = await draftPolicy();
    await request_(running);
    // the owner changes the workflow to ask finance instead, and publishes
    await put(`/api/v1/admin/workflows/definitions/${defId}/draft`, {
      spec: spec([step('a', [user('finance')])]),
    }).expect(200);
    await post(`/api/v1/admin/workflows/definitions/${defId}/publish`).expect(201);

    expect((await inbox(tok.manager)).some((i) => i.subjectId === running)).toBe(true); // the old request still asks the manager
    expect((await inbox(tok.finance)).some((i) => i.subjectId === running)).toBe(false);
    const fresh = await draftPolicy();
    await request_(fresh);
    expect((await inbox(tok.finance)).some((i) => i.subjectId === fresh)).toBe(true); // the new one asks finance
    expect((await inbox(tok.manager)).some((i) => i.subjectId === fresh)).toBe(false);
  });

  it('#11 a step can forbid withdrawing; the requester is refused, a monitor can still cancel', async () => {
    await publishDef(spec([step('a', [user('manager')], { allowWithdraw: false })]), 'test.retry');
    // the requester is a plain agent (administrators and managers are monitors, who may always cancel)
    const agentActor = {
      ...actorOf(),
      accountId: aid.agent,
      staffProfileId: sid.agent,
      displayName: 'Test Agent',
      roleCodes: ['rental_agent'],
    } as Actor;
    const g = await app
      .get(WorkflowPublic)
      .gate({ actionKey: 'test.retry', subjectId: 'withdraw-1', actor: agentActor });
    if (g.direct) throw new Error('expected a request');
    await post(`/api/v1/workflows/instances/${g.instanceId}/withdraw`, {}, tok.agent)
      .expect(403)
      .expect((r) => expect(r.body.params.reason).toBe('withdraw_not_allowed'));
    await post(`/api/v1/workflows/instances/${g.instanceId}/cancel`, {
      reason: 'monitor override',
    }).expect(201);
    const [inst] = await db
      .select()
      .from(workflowInstance)
      .where(eq(workflowInstance.id, g.instanceId));
    expect(inst!.status).toBe('cancelled');
  });

  it('#11 with withdrawing allowed (the default) the requester can pull the request back', async () => {
    await publishDef(spec([step('a', [user('manager')])]), 'test.retry');
    const agentActor = {
      ...actorOf(),
      accountId: aid.agent,
      staffProfileId: sid.agent,
      displayName: 'Test Agent',
      roleCodes: ['rental_agent'],
    } as Actor;
    const g = await app
      .get(WorkflowPublic)
      .gate({ actionKey: 'test.retry', subjectId: 'withdraw-2', actor: agentActor });
    if (g.direct) throw new Error('expected a request');
    await post(`/api/v1/workflows/instances/${g.instanceId}/withdraw`, {}, tok.agent).expect(201);
  });

  it('#16 a workflow that is unbound and archived leaves its running requests to finish on the version they started', async () => {
    const defId = await publishDef(spec([step('a', [user('manager')])]), 'config.version.publish');
    const id = await draftPolicy();
    await request_(id);
    await post(`/api/v1/admin/workflows/definitions/${defId}/archive`).expect(422); // still bound
    await db.delete(workflowBinding);
    await post(`/api/v1/admin/workflows/definitions/${defId}/archive`).expect(201);
    const item = (await inbox(tok.manager)).find((i) => i.subjectId === id)!;
    await post(
      `/api/v1/workflows/tasks/${item.taskId}/decide`,
      { decision: 'approve' },
      tok.manager,
    ).expect(201);
    expect(await stateOf(id)).toBe('published');
  });

  it('#24 a rule that reads a variable the request did not supply is "no match" and takes the else branch', async () => {
    await publishDef(
      spec([
        {
          id: 'route',
          name: 'Route',
          type: 'condition',
          branches: [{ when: { '>': [{ var: 'x' }, 5] }, next: 'gate' }],
          else: null,
        },
        step('gate', [user('manager')]),
      ]),
      'test.vars',
    );
    const wf = app.get(WorkflowPublic);
    const missing = await wf.gate({
      actionKey: 'test.vars',
      subjectId: 'vars-missing',
      actor: actorOf(),
    }); // no x at all
    const big = await wf.gate({
      actionKey: 'test.vars',
      subjectId: 'vars-big',
      context: { x: 10 },
      actor: actorOf(),
    });
    expect(missing.direct).toBe(false); // no route matched → the else branch ends the workflow → applied without a task
    const [mi] = await db
      .select()
      .from(workflowInstance)
      .where(eq(workflowInstance.subjectId, 'vars-missing'));
    expect(mi!.status).toBe('completed');
    expect(big.direct).toBe(false);
    const [bi] = await db
      .select()
      .from(workflowInstance)
      .where(eq(workflowInstance.subjectId, 'vars-big'));
    expect(bi!.status).toBe('running'); // x=10 matched → waits for the manager
  });

  it('#28 a client that retries its submit with the same idempotency key gets the same request, not a second', async () => {
    await publishDef(spec([step('a', [user('manager')])]), 'test.retry');
    const wf = app.get(WorkflowPublic);
    const first = await wf.gate({
      actionKey: 'test.retry',
      subjectId: 'retry-1',
      actor: actorOf(),
      submitKey: 'key-1',
    });
    const again = await wf.gate({
      actionKey: 'test.retry',
      subjectId: 'retry-1',
      actor: actorOf(),
      submitKey: 'key-1',
    });
    if (first.direct || again.direct) throw new Error('expected requests');
    expect(again.instanceId).toBe(first.instanceId);
    expect(
      await db.select().from(workflowInstance).where(eq(workflowInstance.subjectId, 'retry-1')),
    ).toHaveLength(1);
  });

  it('#28 a repeated Idempotency-Key on the HTTP decide call replays the first answer', async () => {
    await publishDef(spec([step('a', [user('manager')])]), 'config.version.publish');
    const id = await draftPolicy();
    await request_(id);
    const item = (await inbox(tok.manager)).find((i) => i.subjectId === id)!;
    const send = () =>
      request(server)
        .post(`/api/v1/workflows/tasks/${item.taskId}/decide`)
        .set(auth(tok.manager))
        .set('Idempotency-Key', 'decide-key-1')
        .send({ decision: 'approve' });
    const a = await send();
    const b = await send();
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body).toEqual(a.body);
    expect(await stateOf(id)).toBe('published');
  });

  it('#31 a role held by hundreds of people asks at most 200 of them, and says so', async () => {
    const [auditor] = await db.select().from(role).where(eq(role.code, 'auditor'));
    await db.execute(sql`
      with acc as (
        insert into account (kind, email, email_normalized, status, display_name, locale_code)
        select 'staff', 'bulk' || g || '@example.test', 'bulk' || g || '@example.test', 'active', 'Bulk ' || g, 'en' from generate_series(1, 260) g
        on conflict do nothing returning id),
      prof as (
        insert into staff_profile (account_id, organization_id, status)
        select id, ${orgId}::uuid, 'active' from acc returning id)
      insert into staff_role_assignment (staff_profile_id, role_id) select id, ${auditor!.id}::uuid from prof`);
    await publishDef(spec([step('a', [{ kind: 'role', roleCode: 'auditor' }])]), 'test.many');
    const g = await app
      .get(WorkflowPublic)
      .gate({ actionKey: 'test.many', subjectId: 'many-1', actor: actorOf() });
    if (g.direct) throw new Error('expected a request');
    const [task] = await db
      .select()
      .from(workflowTask)
      .where(eq(workflowTask.instanceId, g.instanceId));
    const asked = await db
      .select()
      .from(workflowTaskAssignee)
      .where(eq(workflowTaskAssignee.taskId, task!.id));
    expect(asked).toHaveLength(200);
    const [opened] = await db
      .select()
      .from(workflowEvent)
      .where(eq(workflowEvent.taskId, task!.id));
    expect((opened!.data as { capped?: number }).capped).toBe(200);
  });

  it('#10 editing a template while its request waits closes that request and starts a fresh one for the new content', async () => {
    await publishDef(spec([step('a', [user('manager')])]), 'template.publish');
    const body = (text: string) => ({
      key: 'reservation_confirmed',
      channel: 'email',
      localeCode: 'en',
      subject: 'Your booking {{reference}}',
      bodyTemplate: text,
      variables: [{ name: 'reference', required: true }],
    });
    const draft = await post(
      '/api/v1/ops/templates/draft',
      body('Thanks {{reference}} — first version. Contact support@example.test.'),
    ).expect(201);
    const id = draft.body.id as string;
    await post(`/api/v1/ops/templates/${id}/publish`).expect(201);
    const [first] = await db
      .select()
      .from(workflowInstance)
      .where(eq(workflowInstance.subjectId, id));
    expect(first!.status).toBe('running');

    await post(
      '/api/v1/ops/templates/draft',
      body('Thanks {{reference}} — second version. Contact support@example.test.'),
    ).expect(201);
    const all = await db.select().from(workflowInstance).where(eq(workflowInstance.subjectId, id));
    expect(all.filter((i) => i.status === 'cancelled')).toHaveLength(1); // the old request is closed…
    expect(all.filter((i) => i.status === 'running')).toHaveLength(1); // …and a new one waits for the manager
    const item = (await inbox(tok.manager)).find((i) => i.subjectId === id)!;
    await post(
      `/api/v1/workflows/tasks/${item.taskId}/decide`,
      { decision: 'approve' },
      tok.manager,
    ).expect(201);
    const [row] = await db.select().from(template).where(eq(template.id, id));
    expect(row!.status).toBe('published');
    expect(row!.bodyTemplate).toContain('second version'); // what went live is what was last approved
  });
});
