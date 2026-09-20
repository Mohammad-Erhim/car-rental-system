import { and, eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Actor } from '../src/common/auth/types';
import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { configVersion } from '../src/database/schema/admin';
import { account, staffProfile } from '../src/database/schema/iam';
import {
  workflowBinding,
  workflowInstance,
  workflowTask,
  workflowTaskAssignee,
} from '../src/database/schema/workflow';
import { WorkflowEngineService } from '../src/modules/workflow/workflow-engine.service';
import { WorkflowPublic } from '../src/modules/workflow/workflow.public';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

// the test environment sets a 1-second step-up window; this spec is about workflows, not re-auth.
// Restored afterwards, because every spec file shares one process (and so one environment).
const ORIGINAL_STEP_UP = process.env.STEP_UP_MAX_AGE_SEC;
process.env.STEP_UP_MAX_AGE_SEC = '900';

const ACTION = 'config.version.publish';

/**
 * The workflow engine end to end, through the real API: pipelines an owner builds, who is asked,
 * the decision rules (any / all / quorum / in order), branching, parallel branches, timers,
 * escalation, races, stale subjects, monitoring, and the guard rails around all of it.
 */
describe('workflow engine', () => {
  let app: Awaited<ReturnType<typeof getTestApp>>;
  let server: ReturnType<typeof httpServer>;
  let db: Database;
  let engine: WorkflowEngineService;
  let tok: Record<'admin' | 'manager' | 'finance' | 'agent', string>;
  const sid: Record<string, string> = {}; // staff profile ids by short name
  const aid: Record<string, string> = {}; // account ids
  let n = 0;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (path: string, t = tok.admin) => request(server).get(path).set(auth(t));
  const post = (path: string, body: object = {}, t = tok.admin) =>
    request(server).post(path).set(auth(t)).send(body);
  const put = (path: string, body: object, t = tok.admin) =>
    request(server).put(path).set(auth(t)).send(body);

  const role = (roleCode: string) => ({ kind: 'role', roleCode });
  const user = (name: string) => ({ kind: 'user', staffProfileId: sid[name] });
  const approval = (
    id: string,
    selectors: object[],
    extra: Record<string, unknown> = {},
    next: string | null = null,
  ) => ({
    id,
    name: `Step ${id}`,
    type: 'approval',
    actors: { selectors, mode: 'any', excludeInitiator: false, ...(extra.actors as object) },
    next,
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'actors')),
  });
  const spec = (start: string | null, steps: object[], extra: Record<string, unknown> = {}) => ({
    start,
    steps: Object.fromEntries(steps.map((s) => [(s as { id: string }).id, s])),
    fallbackActors: [role('administrator')],
    ...extra,
  });

  /** create + publish a definition and bind it to the action; returns the definition id */
  const bindNew = async (
    s: object,
    condition: object | null = null,
    actionKey = ACTION,
  ): Promise<string> => {
    const code = `t_${Date.now().toString(36)}_${n++}`;
    const created = await post('/api/v1/admin/workflows/definitions', {
      code,
      name: code,
      spec: s,
    }).expect(201);
    await post(`/api/v1/admin/workflows/definitions/${created.body.id}/publish`).expect(201);
    await put('/api/v1/admin/workflows/bindings', {
      actionKey,
      definitionId: created.body.id,
      condition,
    }).expect(200);
    return created.body.id as string;
  };

  const draftPolicy = async (key = 'cancellation') => {
    const r = await post('/api/v1/ops/config/versions', {
      kind: 'policy',
      key,
      payload: { freeCancelHours: 40 + n++, lateFeeBps: 1000 },
    }).expect(201);
    return r.body.id as string;
  };
  const publish = (id: string, t = tok.admin) =>
    post(`/api/v1/ops/config/versions/${id}/approve`, {}, t);
  const version = async (id: string) => {
    const [row] = await db.select().from(configVersion).where(eq(configVersion.id, id));
    return row!;
  };
  const inbox = async (t: string) => (await get('/api/v1/workflows/inbox', t).expect(200)).body;
  const decide = (t: string, taskId: string, decision: string, comment?: string) =>
    post(`/api/v1/workflows/tasks/${taskId}/decide`, { decision, comment }, t);
  const taskFor = async (t: string, subjectId: string) => {
    const items = (await inbox(t)) as Array<{ taskId: string; subjectId: string }>;
    return items.find((i) => i.subjectId === subjectId);
  };
  const instanceOf = async (subjectId: string) => {
    const [row] = await db
      .select()
      .from(workflowInstance)
      .where(eq(workflowInstance.subjectId, subjectId))
      .orderBy(sql`${workflowInstance.createdAt} desc`);
    return row!;
  };

  beforeAll(async () => {
    app = await getTestApp();
    server = httpServer(app);
    db = app.get<Database>(DB);
    engine = app.get(WorkflowEngineService);
    const login = async (email: string) =>
      (await signIn(app, email, 'Test-Passw0rd!', 'staff')).accessToken;
    tok = {
      admin: await login('test-admin@example.test'),
      manager: await login('test-manager@example.test'),
      finance: await login('test-finance@example.test'),
      agent: await login('test-agent@example.test'),
    };
    for (const name of ['admin', 'manager', 'finance', 'agent']) {
      const [row] = await db
        .select({ sid: staffProfile.id, aid: account.id })
        .from(account)
        .innerJoin(staffProfile, eq(staffProfile.accountId, account.id))
        .where(eq(account.email, `test-${name}@example.test`));
      sid[name] = row!.sid;
      aid[name] = row!.aid;
    }
  });
  afterAll(async () => {
    if (ORIGINAL_STEP_UP === undefined) delete process.env.STEP_UP_MAX_AGE_SEC;
    else process.env.STEP_UP_MAX_AGE_SEC = ORIGINAL_STEP_UP;
    await closeTestApp();
  });
  beforeEach(async () => {
    // every test starts with nothing bound (Direct), so tests never leak pipelines into each other
    await db.delete(workflowBinding);
  });

  // ───────────────────────── default = Direct ─────────────────────────

  it('with nothing bound, publishing is direct: no request, live at once', async () => {
    const id = await draftPolicy();
    const res = await publish(id).expect(201);
    expect(res.body.state).toBe('published');
    expect(res.body.workflow).toBeUndefined();
    expect(
      await db.select().from(workflowInstance).where(eq(workflowInstance.subjectId, id)),
    ).toHaveLength(0);
  });

  it('ships two built-in definitions, and they cannot be edited or archived', async () => {
    const list = (await get('/api/v1/admin/workflows/definitions').expect(200)).body as Array<{
      id: string;
      code: string;
      isSystem: boolean;
    }>;
    expect(list.map((d) => d.code)).toEqual(
      expect.arrayContaining(['direct', 'two_person_review']),
    );
    const direct = list.find((d) => d.code === 'direct')!;
    await put(`/api/v1/admin/workflows/definitions/${direct.id}/draft`, {
      spec: spec(null, []),
    }).expect(422);
    await post(`/api/v1/admin/workflows/definitions/${direct.id}/archive`).expect(422);
  });

  // ───────────────────────── a two-person pipeline ─────────────────────────

  it('two-person review: captured, not applied; the requester cannot decide; a reviewer applies it', async () => {
    const list = (await get('/api/v1/admin/workflows/definitions').expect(200)).body as Array<{
      id: string;
      code: string;
    }>;
    const two = list.find((d) => d.code === 'two_person_review')!;
    await put('/api/v1/admin/workflows/bindings', {
      actionKey: ACTION,
      definitionId: two.id,
    }).expect(200);

    const id = await draftPolicy();
    const res = await publish(id).expect(201);
    expect(res.body.state).toBe('in_review'); // captured, not applied
    expect(res.body.workflow.status).toBe('running');
    expect(res.body.workflow.waitingFor).toContain('Test Manager');
    expect((await version(id)).state).toBe('in_review');

    // the requester (admin) is excluded by the definition
    expect(await taskFor(tok.admin, id)).toBeUndefined();
    const item = (await taskFor(tok.manager, id))!;
    expect(item).toBeTruthy();

    // asking again returns the same request (no second instance)
    const again = await publish(id).expect(201);
    expect(again.body.workflow.instanceId).toBe(res.body.workflow.instanceId);

    // the manager approves → applied exactly once
    await decide(tok.manager, item.taskId, 'approve').expect(201);
    const v = await version(id);
    expect(v.state).toBe('published');
    expect(v.approvedBy).toBe(aid.manager); // the decider is the one on record
    expect((await instanceOf(id)).status).toBe('completed');
    expect(await taskFor(tok.manager, id)).toBeUndefined();
  });

  it('a rejection needs a comment, closes the request, and rejects the revision', async () => {
    await bindNew(spec('r', [approval('r', [role('manager')])]));
    const id = await draftPolicy();
    await publish(id).expect(201);
    const item = (await taskFor(tok.manager, id))!;
    await decide(tok.manager, item.taskId, 'reject').expect(422); // comment required
    await decide(tok.manager, item.taskId, 'reject', 'wrong number').expect(201);
    expect((await version(id)).state).toBe('rejected');
    expect((await instanceOf(id)).status).toBe('rejected');
    // a decided request cannot be decided again
    await decide(tok.manager, item.taskId, 'approve').expect(409);
  });

  it('request changes sends the draft back; the requester can resubmit', async () => {
    await bindNew(spec('r', [approval('r', [role('manager')])]));
    const id = await draftPolicy();
    await publish(id).expect(201);
    const item = (await taskFor(tok.manager, id))!;
    await decide(tok.manager, item.taskId, 'request_changes', 'lower the fee').expect(201);
    expect((await version(id)).state).toBe('draft');
    expect((await instanceOf(id)).status).toBe('changes_requested');
    const again = await publish(id).expect(201);
    expect(again.body.workflow.revision).toBe(2);
    expect((await version(id)).state).toBe('in_review');
  });

  it('the requester can withdraw; nobody else can, except a monitor', async () => {
    await bindNew(spec('r', [approval('r', [role('manager')])]));
    const id = await draftPolicy();
    const res = await publish(id).expect(201);
    const iid = res.body.workflow.instanceId as string;
    await post(`/api/v1/workflows/instances/${iid}/withdraw`, {}, tok.finance).expect(403); // neither the requester nor a monitor
    await post(`/api/v1/workflows/instances/${iid}/withdraw`, {}, tok.admin).expect(201);
    expect((await version(id)).state).toBe('draft');
    expect((await instanceOf(id)).status).toBe('withdrawn');
    await post(`/api/v1/workflows/instances/${iid}/withdraw`, {}, tok.admin).expect(409);
  });

  // ───────────────────────── who may decide ─────────────────────────

  it('only people who were asked can decide, and being asked is checked again at decision time', async () => {
    await bindNew(spec('r', [approval('r', [user('manager')])]));
    const id = await draftPolicy();
    await publish(id).expect(201);
    const item = (await taskFor(tok.manager, id))!;
    await decide(tok.finance, item.taskId, 'approve').expect(403); // never asked
    // the manager is suspended after being asked → refused
    await db
      .update(staffProfile)
      .set({ status: 'suspended' })
      .where(eq(staffProfile.id, sid.manager));
    await decide(tok.manager, item.taskId, 'approve').expect(403);
    await db.update(staffProfile).set({ status: 'active' }).where(eq(staffProfile.id, sid.manager));
    await decide(tok.manager, item.taskId, 'approve').expect(201);
  });

  it('a step nobody can act on falls back to the definition’s fallback actors (never a dead end)', async () => {
    // only the requester holds the role, and they are excluded → fallback (administrators) is asked
    await bindNew(
      spec('r', [approval('r', [user('admin')], { actors: { excludeInitiator: true } })], {
        fallbackActors: [role('administrator')],
      }),
    );
    const id = await draftPolicy();
    await publish(id).expect(201);
    const item = await taskFor(tok.admin, id);
    expect(item).toBeTruthy(); // the fallback is administrators — here, the requester themself
    await decide(tok.admin, item!.taskId, 'approve').expect(201);
    expect((await version(id)).state).toBe('published');
  });

  // ───────────────────────── modes ─────────────────────────

  it('ALL: every asked person must approve; racing approvals advance exactly once', async () => {
    await bindNew(
      spec('r', [approval('r', [user('manager'), user('finance')], { actors: { mode: 'all' } })]),
    );
    const id = await draftPolicy();
    await publish(id).expect(201);
    const m = (await taskFor(tok.manager, id))!;
    const f = (await taskFor(tok.finance, id))!;
    expect(m.taskId).toBe(f.taskId);
    const [a, b] = await Promise.all([
      decide(tok.manager, m.taskId, 'approve'),
      decide(tok.finance, f.taskId, 'approve'),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect((await version(id)).state).toBe('published');
    const done = await db.select().from(workflowInstance).where(eq(workflowInstance.subjectId, id));
    expect(done).toHaveLength(1);
    expect(done[0]!.status).toBe('completed');
  });

  it('ALL: one rejection ends it', async () => {
    await bindNew(
      spec('r', [approval('r', [user('manager'), user('finance')], { actors: { mode: 'all' } })]),
    );
    const id = await draftPolicy();
    await publish(id).expect(201);
    const m = (await taskFor(tok.manager, id))!;
    await decide(tok.manager, m.taskId, 'approve').expect(201);
    expect((await version(id)).state).toBe('in_review');
    const f = (await taskFor(tok.finance, id))!;
    await decide(tok.finance, f.taskId, 'reject', 'no').expect(201);
    expect((await version(id)).state).toBe('rejected');
  });

  it('QUORUM: 2 of 3 approve; a "no" only ends it when yes can no longer win', async () => {
    await bindNew(
      spec('r', [
        approval('r', [user('manager'), user('finance'), user('agent')], {
          actors: { mode: 'quorum', quorum: 2 },
        }),
      ]),
    );
    const id = await draftPolicy();
    await publish(id).expect(201);
    const t = (await taskFor(tok.manager, id))!;
    await decide(tok.agent, t.taskId, 'reject', 'no').expect(201);
    expect((await instanceOf(id)).status).toBe('running'); // manager + finance can still make 2
    await decide(tok.manager, t.taskId, 'approve').expect(201);
    expect((await version(id)).state).toBe('in_review');
    await decide(tok.finance, t.taskId, 'approve').expect(201);
    expect((await version(id)).state).toBe('published');
  });

  it('IN ORDER: only the first person in line may decide, then the next', async () => {
    await bindNew(
      spec('r', [
        approval('r', [user('manager'), user('finance')], { actors: { mode: 'sequence' } }),
      ]),
    );
    const id = await draftPolicy();
    await publish(id).expect(201);
    const t = (await taskFor(tok.manager, id))!;
    const fin = (await inbox(tok.finance)).find((i: { subjectId: string }) => i.subjectId === id);
    expect(fin.canDecide).toBe(false);
    await decide(tok.finance, t.taskId, 'approve').expect(403); // not your turn
    await decide(tok.manager, t.taskId, 'approve').expect(201);
    expect((await version(id)).state).toBe('in_review');
    await decide(tok.finance, t.taskId, 'approve').expect(201);
    expect((await version(id)).state).toBe('published');
  });

  it('a decision is idempotent for the same person, and a different one is a conflict', async () => {
    await bindNew(
      spec('r', [approval('r', [user('manager'), user('finance')], { actors: { mode: 'all' } })]),
    );
    const id = await draftPolicy();
    await publish(id).expect(201);
    const t = (await taskFor(tok.manager, id))!;
    await decide(tok.manager, t.taskId, 'approve').expect(201);
    await decide(tok.manager, t.taskId, 'approve').expect(201); // same answer, no double count
    await decide(tok.manager, t.taskId, 'reject', 'changed my mind').expect(409);
    expect((await instanceOf(id)).status).toBe('running');
  });

  // ───────────────────────── branching, sequences, parallel ─────────────────────────

  it('multi-step pipelines run in order', async () => {
    await bindNew(
      spec('a', [approval('a', [user('manager')], {}, 'b'), approval('b', [user('finance')])]),
    );
    const id = await draftPolicy();
    await publish(id).expect(201);
    await decide(tok.finance, (await taskFor(tok.manager, id))!.taskId, 'approve').expect(403);
    await decide(tok.manager, (await taskFor(tok.manager, id))!.taskId, 'approve').expect(201);
    expect((await version(id)).state).toBe('in_review');
    await decide(tok.finance, (await taskFor(tok.finance, id))!.taskId, 'approve').expect(201);
    expect((await version(id)).state).toBe('published');
  });

  it('a condition routes on the request’s variables', async () => {
    await bindNew(
      spec('c', [
        {
          id: 'c',
          name: 'Route',
          type: 'condition',
          branches: [{ label: 'fuel', when: { '==': [{ var: 'key' }, 'fuel_rate'] }, next: 'fin' }],
          else: null, // everything else is applied directly
        },
        approval('fin', [user('finance')]),
      ]),
    );
    const cancellation = await draftPolicy('cancellation');
    const direct = await publish(cancellation).expect(201);
    expect(direct.body.state).toBe('published'); // else → end

    const fuel = await post('/api/v1/ops/config/versions', {
      kind: 'policy',
      key: 'fuel_rate',
      payload: { minorPerPct: 100 + n++ },
    }).expect(201);
    const routed = await publish(fuel.body.id).expect(201);
    expect(routed.body.state).toBe('in_review');
    expect(routed.body.workflow.stepName).toBe('Step fin');
  });

  it('parallel branches: the join waits for every branch', async () => {
    await bindNew(
      spec('p', [
        {
          id: 'p',
          name: 'Both',
          type: 'parallel',
          branches: [['x'], ['y']],
          join: 'all',
          next: null,
        },
        approval('x', [user('manager')]),
        approval('y', [user('finance')]),
      ]),
    );
    const id = await draftPolicy();
    await publish(id).expect(201);
    await decide(tok.manager, (await taskFor(tok.manager, id))!.taskId, 'approve').expect(201);
    expect((await version(id)).state).toBe('in_review');
    await decide(tok.finance, (await taskFor(tok.finance, id))!.taskId, 'approve').expect(201);
    expect((await version(id)).state).toBe('published');
  });

  it('a parallel "any" join releases on the first finished branch and stands the others down', async () => {
    await bindNew(
      spec('p', [
        {
          id: 'p',
          name: 'Either',
          type: 'parallel',
          branches: [['x'], ['y']],
          join: 'any',
          next: null,
        },
        approval('x', [user('manager')]),
        approval('y', [user('finance')]),
      ]),
    );
    const id = await draftPolicy();
    await publish(id).expect(201);
    await decide(tok.manager, (await taskFor(tok.manager, id))!.taskId, 'approve').expect(201);
    expect((await version(id)).state).toBe('published');
    expect(await taskFor(tok.finance, id)).toBeUndefined(); // stood down
  });

  // ───────────────────────── timers ─────────────────────────

  it('a wait step releases when its time comes, driven by the reconciler', async () => {
    await bindNew(spec('w', [{ id: 'w', name: 'Cool off', type: 'wait', hours: 2, next: null }]));
    const id = await draftPolicy();
    await publish(id).expect(201);
    expect((await version(id)).state).toBe('in_review');
    await engine.tick(new Date(Date.now() + 60 * 60 * 1000));
    expect((await version(id)).state).toBe('in_review'); // one hour: not yet
    await engine.tick(new Date(Date.now() + 3 * 60 * 60 * 1000));
    expect((await version(id)).state).toBe('published');
  });

  it('an overdue task escalates to the named people, once', async () => {
    await bindNew(
      spec('r', [
        approval('r', [user('manager')], {
          due: { hours: 1, onTimeout: 'escalate', escalateTo: [user('finance')] },
        }),
      ]),
    );
    const id = await draftPolicy();
    await publish(id).expect(201);
    expect(await taskFor(tok.finance, id)).toBeUndefined();
    const first = await engine.tick(new Date(Date.now() + 2 * 60 * 60 * 1000));
    expect(first.escalated).toBe(1);
    const item = (await taskFor(tok.finance, id))!;
    expect(item).toBeTruthy();
    const second = await engine.tick(new Date(Date.now() + 3 * 60 * 60 * 1000));
    expect(second.escalated).toBe(0);
    await decide(tok.finance, item.taskId, 'approve').expect(201);
    expect((await version(id)).state).toBe('published');
  });

  it('a timeout can auto-reject', async () => {
    await bindNew(
      spec('r', [approval('r', [user('manager')], { due: { hours: 1, onTimeout: 'reject' } })]),
    );
    const id = await draftPolicy();
    await publish(id).expect(201);
    await engine.tick(new Date(Date.now() + 2 * 60 * 60 * 1000));
    expect((await version(id)).state).toBe('rejected');
    expect((await instanceOf(id)).status).toBe('rejected');
  });

  it('when someone becomes eligible, or stops being, the open task follows (reconciler)', async () => {
    await bindNew(spec('r', [approval('r', [role('rental_agent')])]));
    const id = await draftPolicy();
    await publish(id).expect(201);
    const t = (await taskFor(tok.agent, id))!;
    expect(t).toBeTruthy();
    // the only agent is suspended → the task moves to the fallback (administrators)
    await db
      .update(staffProfile)
      .set({ status: 'suspended' })
      .where(eq(staffProfile.id, sid.agent));
    await engine.tick();
    await db.update(staffProfile).set({ status: 'active' }).where(eq(staffProfile.id, sid.agent));
    const adminItem = await taskFor(tok.admin, id);
    expect(adminItem).toBeTruthy();
    expect(adminItem!.taskId).toBe(t.taskId);
  });

  // ───────────────────────── the subject changes ─────────────────────────

  it('a subject that changed after it was requested closes the request as stale', async () => {
    await bindNew(spec('r', [approval('r', [user('manager')])]));
    const id = await draftPolicy();
    await publish(id).expect(201);
    const item = (await taskFor(tok.manager, id))!;
    await db
      .update(configVersion)
      .set({ payload: { freeCancelHours: 99, lateFeeBps: 5000 } })
      .where(eq(configVersion.id, id));
    // the decision is refused with the reason, and the request is closed as stale
    const res = await decide(tok.manager, item.taskId, 'approve').expect(409);
    expect(res.body.params.reason).toBe('stale');
    expect((await instanceOf(id)).status).toBe('stale');
    expect((await version(id)).state).toBe('draft'); // handed back to its author
  });

  // ───────────────────────── monitoring ─────────────────────────

  it('a monitor sees every request and can reassign, force through, or cancel — with a reason', async () => {
    await bindNew(spec('r', [approval('r', [user('manager')])]));
    const id = await draftPolicy();
    const res = await publish(id).expect(201);
    const iid = res.body.workflow.instanceId as string;

    // ordinary staff cannot monitor
    await get('/api/v1/workflows/instances?scope=all', tok.agent).expect(403);
    const all = (await get('/api/v1/workflows/instances?scope=all&status=open').expect(200))
      .body as Array<{ instanceId: string }>;
    expect(all.map((i) => i.instanceId)).toContain(iid);

    const t = (await taskFor(tok.manager, id))!;
    await post(`/api/v1/workflows/tasks/${t.taskId}/reassign`, {
      toStaffProfileId: sid.finance,
      reason: 'manager on leave',
    }).expect(201);
    expect(await taskFor(tok.manager, id)).toBeUndefined();
    expect(await taskFor(tok.finance, id)).toBeTruthy();

    await post(`/api/v1/workflows/instances/${iid}/force`, { decision: 'approve' }).expect(422); // reason required
    await post(`/api/v1/workflows/instances/${iid}/force`, {
      decision: 'approve',
      reason: 'urgent, approved by phone',
    }).expect(201);
    expect((await version(id)).state).toBe('published');

    const id2 = await draftPolicy();
    const r2 = await publish(id2).expect(201);
    await post(`/api/v1/workflows/instances/${r2.body.workflow.instanceId}/cancel`, {
      reason: 'obsolete',
    }).expect(201);
    expect((await version(id2)).state).toBe('draft');
    expect((await instanceOf(id2)).status).toBe('cancelled');
  });

  // ───────────────────────── configuration guard rails ─────────────────────────

  it('refuses to publish a workflow nobody can act on, or that reads unknown variables', async () => {
    const nobody = await post('/api/v1/admin/workflows/definitions', {
      code: `t_nobody_${n++}`,
      name: 'Nobody',
      spec: spec('r', [approval('r', [role('auditor')])]),
    }).expect(201);
    const res = await post(`/api/v1/admin/workflows/definitions/${nobody.body.id}/publish`).expect(
      422,
    );
    expect(res.body.params.reason).toBe('workflow_invalid');
    expect(JSON.stringify(res.body.params.issues)).toContain('no_actor');

    const cyclic = await post('/api/v1/admin/workflows/definitions/validate', {
      spec: spec('a', [
        approval('a', [user('manager')], {}, 'b'),
        approval('b', [user('finance')], {}, 'a'),
      ]),
    }).expect(201);
    expect(cyclic.body.issues.map((i: { code: string }) => i.code)).toContain('cycle');

    const def = await post('/api/v1/admin/workflows/definitions', {
      code: `t_var_${n++}`,
      name: 'Var',
      spec: spec('c', [
        {
          id: 'c',
          name: 'C',
          type: 'condition',
          branches: [{ when: { '>': [{ var: 'nope' }, 1] }, next: null }],
          else: null,
        },
      ]),
    }).expect(201);
    await post(`/api/v1/admin/workflows/definitions/${def.body.id}/publish`).expect(201); // unbound: no variables to check yet
    await put('/api/v1/admin/workflows/bindings', {
      actionKey: ACTION,
      definitionId: def.body.id,
    }).expect(422);
  });

  it('only administrators may build workflows; monitors and others may only look', async () => {
    await post(
      '/api/v1/admin/workflows/definitions',
      { code: 'x_agent', name: 'x', spec: spec(null, []) },
      tok.agent,
    ).expect(403);
    await post(
      '/api/v1/admin/workflows/definitions',
      { code: 'x_mgr', name: 'x', spec: spec(null, []) },
      tok.manager,
    ).expect(403);
    await get('/api/v1/admin/workflows/definitions', tok.manager).expect(200); // monitor can read
    await get('/api/v1/admin/workflows/definitions', tok.agent).expect(403);
  });

  it('a bound workflow cannot be archived; unbinding returns the action to Direct', async () => {
    const defId = await bindNew(spec('r', [approval('r', [user('manager')])]));
    await post(`/api/v1/admin/workflows/definitions/${defId}/archive`).expect(422);
    const bindings = (await get('/api/v1/admin/workflows/bindings').expect(200)).body as Array<{
      id: string;
    }>;
    for (const b of bindings)
      await request(server)
        .delete(`/api/v1/admin/workflows/bindings/${b.id}`)
        .set(auth(tok.admin))
        .expect(200);
    const id = await draftPolicy();
    expect((await publish(id).expect(201)).body.state).toBe('published');
    await post(`/api/v1/admin/workflows/definitions/${defId}/archive`).expect(201);
  });

  it('the simulator shows who would be asked without creating anything', async () => {
    const sim = await post('/api/v1/admin/workflows/simulate', {
      spec: spec('a', [
        approval('a', [user('manager')], {}, 'b'),
        approval('b', [role('finance_staff')]),
      ]),
    }).expect(201);
    expect(sim.body.direct).toBe(false);
    expect(sim.body.path.map((p: { stepId: string }) => p.stepId)).toEqual(['a', 'b']);
    expect(sim.body.path[0].asks[0].name).toBe('Test Manager');
    expect(sim.body.path[1].asks.map((a: { name: string }) => a.name)).toContain('Test Finance');
  });

  it('the inbox counts what is waiting, and “my requests” lists what I asked for', async () => {
    await bindNew(
      spec('r', [approval('r', [user('manager')], { due: { hours: 1, onTimeout: 'wait' } })]),
    );
    const id = await draftPolicy();
    await publish(id).expect(201);
    const count = (await get('/api/v1/workflows/inbox/count', tok.manager).expect(200)).body;
    expect(count.pending).toBeGreaterThanOrEqual(1);
    const mine = (await get('/api/v1/workflows/instances?scope=mine&status=open').expect(200))
      .body as Array<{ subjectId: string }>;
    expect(mine.map((m) => m.subjectId)).toContain(id);
    const detail = (
      await get(`/api/v1/workflows/instances/${(await instanceOf(id)).id}`, tok.manager).expect(200)
    ).body;
    expect(detail.tasks[0].assignees[0].name).toBe('Test Manager');
    expect(detail.history.map((h: { type: string }) => h.type)).toContain('instance.created');
    await get(`/api/v1/workflows/instances/${(await instanceOf(id)).id}`, tok.agent).expect(404); // not involved
  });

  // ───────────────────────── executor failure ─────────────────────────

  it('a failing executor is retried with backoff and never asks the approvers again', async () => {
    const workflows = app.get(WorkflowPublic);
    let calls = 0;
    workflows.register({
      key: 'test.flaky',
      subjectType: 'test_subject',
      label: 'Flaky',
      description: 'test only',
      variables: [],
      fingerprint: async () => 'fixed',
      execute: async () => {
        calls++;
        if (calls < 3) throw new Error('gateway down');
        return { ok: true };
      },
    });
    await bindNew(spec('r', [approval('r', [user('manager')])]), null, 'test.flaky');
    const actor = {
      accountId: aid.admin,
      kind: 'staff',
      audience: 'staff',
      displayName: 'Test Admin',
      localeCode: 'en',
      staffProfileId: sid.admin,
      organizationId: (
        await db.select().from(staffProfile).where(eq(staffProfile.id, sid.admin))
      )[0]!.organizationId,
      permissions: [],
      roleCodes: ['administrator'],
      locationScope: [],
      permissionConditions: {},
      tokenId: 't',
    } as Actor;
    const gate = await workflows.gate({ actionKey: 'test.flaky', subjectId: 'subject-1', actor });
    expect(gate.direct).toBe(false);
    const item = (await taskFor(tok.manager, 'subject-1'))!;
    await decide(tok.manager, item.taskId, 'approve').expect(201);
    expect((await instanceOf('subject-1')).status).toBe('apply_failed');
    expect(calls).toBe(1);
    await engine.tick(new Date(Date.now() + 5 * 60 * 1000)); // backoff elapsed
    expect((await instanceOf('subject-1')).status).toBe('apply_failed');
    expect(calls).toBe(2);
    await engine.tick(new Date(Date.now() + 60 * 60 * 1000));
    const done = await instanceOf('subject-1');
    expect(done.status).toBe('completed');
    expect(calls).toBe(3);
    // the approvers were never asked twice
    const tasks = await db.select().from(workflowTask).where(eq(workflowTask.instanceId, done.id));
    expect(tasks).toHaveLength(1);
    const assignees = await db
      .select()
      .from(workflowTaskAssignee)
      .where(and(eq(workflowTaskAssignee.instanceId, done.id)));
    expect(assignees.filter((a) => a.decision === 'approve')).toHaveLength(1);
  });
});
