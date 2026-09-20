import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { configVersion } from '../src/database/schema/admin';
import { account, staffProfile } from '../src/database/schema/iam';
import {
  workflowBinding,
  workflowDelegation,
  workflowInstance,
} from '../src/database/schema/workflow';
import { WorkflowEngineService } from '../src/modules/workflow/workflow-engine.service';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

const ORIGINAL_STEP_UP = process.env.STEP_UP_MAX_AGE_SEC;
process.env.STEP_UP_MAX_AGE_SEC = '900';

const ACTION = 'config.version.publish';
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

/** Out of office: a colleague covers a person's tasks for a while — visibly, time-boxed, never transitive. */
describe('workflow delegation (out of office)', () => {
  let app: Awaited<ReturnType<typeof getTestApp>>;
  let server: ReturnType<typeof httpServer>;
  let db: Database;
  let engine: WorkflowEngineService;
  let tok: Record<'admin' | 'manager' | 'finance' | 'agent', string>;
  const sid = {} as Record<'admin' | 'manager' | 'finance' | 'agent', string>;
  const aid = {} as Record<'admin' | 'manager' | 'finance' | 'agent', string>;
  let n = 0;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (path: string, t = tok.admin) => request(server).get(path).set(auth(t));
  const post = (path: string, body: object = {}, t = tok.admin) =>
    request(server).post(path).set(auth(t)).send(body);
  const put = (path: string, body: object, t = tok.admin) =>
    request(server).put(path).set(auth(t)).send(body);
  const inbox = async (t: string) =>
    (await get('/api/v1/workflows/inbox', t).expect(200)).body.items as Array<{
      taskId: string;
      subjectId: string;
      onBehalfOfName: string | null;
    }>;

  const bindApproval = async (selectors: object[], actors: Record<string, unknown> = {}) => {
    const code = `dg_${Date.now().toString(36)}_${n++}`;
    const created = await post('/api/v1/admin/workflows/definitions', {
      code,
      name: code,
      spec: {
        start: 'ok',
        steps: {
          ok: {
            id: 'ok',
            name: 'Approve',
            type: 'approval',
            actors: { selectors, mode: 'any', ...actors },
            next: null,
          },
        },
        fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
      },
    }).expect(201);
    await post(`/api/v1/admin/workflows/definitions/${created.body.id}/publish`).expect(201);
    await put('/api/v1/admin/workflows/bindings', {
      actionKey: ACTION,
      definitionId: created.body.id,
    }).expect(200);
  };
  const user = (name: keyof typeof sid) => ({ kind: 'user', staffProfileId: sid[name] });
  const startRequest = async (t = tok.admin) => {
    const d = await post(
      '/api/v1/ops/config/versions',
      {
        kind: 'policy',
        key: 'cancellation',
        payload: { freeCancelHours: 40 + n++, lateFeeBps: 1000 },
      },
      t,
    ).expect(201);
    await post(`/api/v1/ops/config/versions/${d.body.id}/approve`, {}, t).expect(201);
    return d.body.id as string;
  };
  const delegate = (
    from: keyof typeof tok,
    to: keyof typeof sid,
    body: Record<string, unknown> = {},
  ) =>
    post(
      '/api/v1/workflows/delegations',
      { delegateStaffProfileId: sid[to], validUntil: inDays(2), ...body },
      tok[from],
    );
  const state = async (id: string) =>
    (await db.select().from(configVersion).where(eq(configVersion.id, id)))[0]!;

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
    for (const name of ['admin', 'manager', 'finance', 'agent'] as const) {
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
    await db.delete(workflowBinding);
    await db.delete(workflowDelegation);
  });

  it('a delegate can decide a task that was already waiting, on the person’s behalf, on the record', async () => {
    await bindApproval([user('manager')]);
    const id = await startRequest();
    expect((await inbox(tok.agent)).some((i) => i.subjectId === id)).toBe(false); // not theirs yet

    await delegate('manager', 'agent').then((r) => expect(r.status).toBe(201));
    await engine.tick(); // the reconciler hands the open task to the delegate
    const item = (await inbox(tok.agent)).find((i) => i.subjectId === id)!;
    expect(item).toBeTruthy();
    expect(item.onBehalfOfName).toBe('Test Manager');

    await post(
      `/api/v1/workflows/tasks/${item.taskId}/decide`,
      { decision: 'approve' },
      tok.agent,
    ).expect(201);
    const v = await state(id);
    expect(v.state).toBe('published');
    expect(v.approvedBy).toBe(aid.agent); // the person who actually decided is on record
    // the manager's own task is settled too, and the history says who decided for whom
    expect((await inbox(tok.manager)).some((i) => i.subjectId === id)).toBe(false);
    const [inst] = await db
      .select()
      .from(workflowInstance)
      .where(eq(workflowInstance.subjectId, id));
    const detail = (await get(`/api/v1/workflows/instances/${inst!.id}`).expect(200)).body;
    const approve = detail.history.find((h: { type: string }) => h.type === 'decision.approve');
    expect(approve.actor).toBe('Test Agent');
    expect(approve.data.onBehalfOf).toBe(sid.manager);
    const asked = detail.tasks[0].assignees.find(
      (a: { name: string }) => a.name === 'Test Manager',
    );
    expect(asked.decision).toBe('approve');
  });

  it('a new request goes to the delegate straight away — no waiting for the reconciler', async () => {
    await bindApproval([user('manager')]);
    await delegate('manager', 'agent').expect(201);
    const id = await startRequest();
    const item = (await inbox(tok.agent)).find((i) => i.subjectId === id)!;
    expect(item.onBehalfOfName).toBe('Test Manager');
    expect((await inbox(tok.manager)).some((i) => i.subjectId === id)).toBe(true); // the person keeps theirs too
  });

  it('when the person decides first, the cover is withdrawn', async () => {
    await bindApproval([user('manager')]);
    await delegate('manager', 'agent').expect(201);
    const id = await startRequest();
    const mine = (await inbox(tok.manager)).find((i) => i.subjectId === id)!;
    await post(
      `/api/v1/workflows/tasks/${mine.taskId}/decide`,
      { decision: 'approve' },
      tok.manager,
    ).expect(201);
    expect((await inbox(tok.agent)).some((i) => i.subjectId === id)).toBe(false);
  });

  it('a revoked or expired delegation stops working at once, and the cover row is tidied up', async () => {
    await bindApproval([user('manager')]);
    const created = (await delegate('manager', 'agent').expect(201)).body;
    const id = await startRequest();
    const item = (await inbox(tok.agent)).find((i) => i.subjectId === id)!;
    await request(server)
      .delete(`/api/v1/workflows/delegations/${created.id}`)
      .set(auth(tok.manager))
      .expect(200);
    // even before the reconciler runs, the delegate can no longer decide
    await post(`/api/v1/workflows/tasks/${item.taskId}/decide`, { decision: 'approve' }, tok.agent)
      .expect(403)
      .expect((r) => expect(r.body.params.reason).toBe('delegation_ended'));
    await engine.tick();
    expect((await inbox(tok.agent)).some((i) => i.subjectId === id)).toBe(false);
    expect((await state(id)).state).toBe('in_review');
  });

  it('in an ALL step the person and their delegate count once, not twice', async () => {
    await bindApproval([user('manager'), user('finance')], { mode: 'all' });
    await delegate('manager', 'agent').expect(201);
    const id = await startRequest();
    const cover = (await inbox(tok.agent)).find((i) => i.subjectId === id)!;
    await post(
      `/api/v1/workflows/tasks/${cover.taskId}/decide`,
      { decision: 'approve' },
      tok.agent,
    ).expect(201); // for the manager
    expect((await state(id)).state).toBe('in_review'); // finance still has to agree
    const fin = (await inbox(tok.finance)).find((i) => i.subjectId === id)!;
    await post(
      `/api/v1/workflows/tasks/${fin.taskId}/decide`,
      { decision: 'approve' },
      tok.finance,
    ).expect(201);
    expect((await state(id)).state).toBe('published');
  });

  it('a delegation is not transitive: a delegate cannot pass it on', async () => {
    await bindApproval([user('manager')]);
    await delegate('manager', 'agent').expect(201);
    await delegate('agent', 'finance').expect(201); // agent covers for finance… but only for agent’s OWN tasks
    const id = await startRequest();
    expect((await inbox(tok.finance)).some((i) => i.subjectId === id)).toBe(false);
  });

  it('the requester is still excluded when a step says so — even as a delegate', async () => {
    await bindApproval([user('manager')], { excludeInitiator: true });
    await delegate('manager', 'admin').expect(201);
    const id = await startRequest(tok.admin); // admin is the requester AND the manager's delegate
    expect((await inbox(tok.admin)).some((i) => i.subjectId === id)).toBe(false);
  });

  it('refuses nonsense: yourself, a loop, the past, more than 90 days, someone inactive', async () => {
    await delegate('manager', 'manager')
      .expect(422)
      .expect((r) => expect(r.body.params.reason).toBe('delegate_self'));
    await delegate('manager', 'agent', {
      validUntil: new Date(Date.now() - 1000).toISOString(),
    }).expect(422);
    await delegate('manager', 'agent', { validUntil: inDays(120) })
      .expect(422)
      .expect((r) => expect(r.body.params.reason).toBe('delegation_too_long'));
    await delegate('manager', 'agent').expect(201);
    await delegate('agent', 'manager')
      .expect(422)
      .expect((r) => expect(r.body.params.reason).toBe('delegation_loop'));
    await db
      .update(staffProfile)
      .set({ status: 'suspended' })
      .where(eq(staffProfile.id, sid.finance));
    await delegate('manager', 'finance')
      .expect(422)
      .expect((r) => expect(r.body.params.reason).toBe('delegate_inactive'));
    await db.update(staffProfile).set({ status: 'active' }).where(eq(staffProfile.id, sid.finance));
  });

  it('lists who I cover for and who covers for me; the delegate can decline; strangers cannot revoke', async () => {
    const created = (await delegate('manager', 'agent').expect(201)).body;
    const mine = (await get('/api/v1/workflows/delegations', tok.manager).expect(200))
      .body as Array<{ direction: string; delegate: { name: string } }>;
    expect(mine[0]).toMatchObject({ direction: 'outgoing', delegate: { name: 'Test Agent' } });
    const theirs = (await get('/api/v1/workflows/delegations', tok.agent).expect(200))
      .body as Array<{ direction: string }>;
    expect(theirs[0]!.direction).toBe('incoming');
    const people = (await get('/api/v1/workflows/delegations/people', tok.manager).expect(200))
      .body as Array<{ name: string }>;
    expect(people.map((p) => p.name)).not.toContain('Test Manager'); // never yourself
    await request(server)
      .delete(`/api/v1/workflows/delegations/${created.id}`)
      .set(auth(tok.finance))
      .expect(403);
    await request(server)
      .delete(`/api/v1/workflows/delegations/${created.id}`)
      .set(auth(tok.agent))
      .expect(200); // decline
  });
});
