import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { account, staffProfile } from '../src/database/schema/iam';
import { workflowDefinition, workflowDefinitionVersion } from '../src/database/schema/workflow';
import { WorkflowDefinitionService } from '../src/modules/workflow/workflow-definition.service';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

const N = 6000; // open requests, each with one task for the manager
const STAFF_SHARE = 0.05; // the manager holds 5% of all open tasks — the realistic shape of an inbox

/**
 * The inbox and the monitor list must stay fast with thousands of open requests. Rows are bulk-loaded
 * with SQL (the engine's own paths are covered elsewhere); this measures the read paths and proves the
 * keyset pages neither skip nor repeat at scale.
 */
describe('workflow read paths at scale', () => {
  let db: Database;
  let server: ReturnType<typeof httpServer>;
  let manager: string;
  let admin: string;
  let managerProfile: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    db = app.get<Database>(DB);
    admin = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff')).accessToken;
    manager = (await signIn(app, 'test-manager@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    const [row] = await db
      .select({ id: staffProfile.id, org: staffProfile.organizationId })
      .from(account)
      .innerJoin(staffProfile, eq(staffProfile.accountId, account.id))
      .where(eq(account.email, 'test-manager@example.test'));
    managerProfile = row!.id;
    const [other] = await db
      .select({ id: staffProfile.id })
      .from(account)
      .innerJoin(staffProfile, eq(staffProfile.accountId, account.id))
      .where(eq(account.email, 'test-finance@example.test'));
    await app.get(WorkflowDefinitionService).ensureBuiltIns(row!.org);
    const [def] = await db
      .select()
      .from(workflowDefinition)
      .where(eq(workflowDefinition.organizationId, row!.org))
      .limit(1);
    const [ver] = await db
      .select()
      .from(workflowDefinitionVersion)
      .where(eq(workflowDefinitionVersion.definitionId, def!.id))
      .limit(1);
    const mine = Math.round(N * STAFF_SHARE);
    // instances → tasks → assignees, in three set-based statements
    await db.execute(sql`
      insert into workflow_instance (id, organization_id, action_key, subject_type, subject_id, definition_id, definition_version_id, status, initiator_account_id, initiator_label, subject_label)
      select gen_random_uuid(), ${row!.org}, 'load.test', 'load_subject', 'load-' || g, ${def!.id}, ${ver!.id}, 'running', ${row!.id}::uuid, 'Load', 'Load ' || g
      from generate_series(1, ${N}) g`);
    await db.execute(sql`
      insert into workflow_task (instance_id, step_id, step_type, title, mode, required, due_at, created_at)
      select i.id, 's', 'approval', 'Step', 'any', 1,
             case when (row_number() over ()) % 3 = 0 then null else now() + ((row_number() over ()) % 500 - 250) * interval '1 hour' end,
             now() - ((row_number() over ()) % 1000) * interval '1 minute'
      from workflow_instance i where i.action_key = 'load.test'`);
    await db.execute(sql`
      insert into workflow_task_assignee (task_id, instance_id, staff_profile_id, source)
      select t.id, t.instance_id, case when (row_number() over ()) <= ${mine} then ${managerProfile}::uuid else ${other!.id}::uuid end, 'user'
      from workflow_task t join workflow_instance i on i.id = t.instance_id where i.action_key = 'load.test'`);
    await db.execute(sql`analyze workflow_instance, workflow_task, workflow_task_assignee`);
  }, 120_000);
  afterAll(closeTestApp);

  const time = async (fn: () => Promise<unknown>) => {
    const t = process.hrtime.bigint();
    await fn();
    return Number(process.hrtime.bigint() - t) / 1e6;
  };
  const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)]!;

  it('the first inbox page and the badge count stay fast with thousands of open tasks', async () => {
    const first: number[] = [];
    const count: number[] = [];
    for (let i = 0; i < 20; i++) {
      first.push(
        await time(() =>
          request(server)
            .get('/api/v1/workflows/inbox?limit=25')
            .set({ Authorization: `Bearer ${manager}` })
            .expect(200),
        ),
      );
      count.push(
        await time(() =>
          request(server)
            .get('/api/v1/workflows/inbox/count')
            .set({ Authorization: `Bearer ${manager}` })
            .expect(200),
        ),
      );
    }
    expect(p95(first)).toBeLessThan(400);
    expect(p95(count)).toBeLessThan(400);
  });

  it('walking the whole inbox by keyset returns every task exactly once, urgent first', async () => {
    const seen = new Set<string>();
    const dues: number[] = [];
    let cursor: string | null = null;
    let pages = 0;
    let slowest = 0;
    do {
      const q: string = `limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      let body!: {
        items: Array<{ taskId: string; dueAt: string | null }>;
        nextCursor: string | null;
      };
      slowest = Math.max(
        slowest,
        await time(
          async () =>
            (body = (
              await request(server)
                .get(`/api/v1/workflows/inbox?${q}`)
                .set({ Authorization: `Bearer ${manager}` })
                .expect(200)
            ).body),
        ),
      );
      for (const i of body.items) {
        expect(seen.has(i.taskId)).toBe(false);
        seen.add(i.taskId);
        dues.push(i.dueAt ? Date.parse(i.dueAt) : Number.POSITIVE_INFINITY);
      }
      cursor = body.nextCursor;
      pages++;
    } while (cursor && pages < 100);
    expect(seen.size).toBe(Math.round(N * STAFF_SHARE));
    expect(dues).toEqual([...dues].sort((a, b) => a - b)); // ordered by deadline, no-deadline last
    expect(slowest).toBeLessThan(600); // the last page costs about the same as the first
  });

  it('a monitor’s list of requests pages quickly too', async () => {
    const ms = await time(() =>
      request(server)
        .get('/api/v1/workflows/instances?scope=all&status=open&limit=100')
        .set({ Authorization: `Bearer ${admin}` })
        .expect(200),
    );
    expect(ms).toBeLessThan(800);
  });

  it('the inbox query is served by an index, not a scan of every task', async () => {
    const plan = await db.execute(sql`
      explain select t.id from workflow_task_assignee a join workflow_task t on t.id = a.task_id
      where a.staff_profile_id = ${managerProfile}::uuid and a.status = 'pending' and t.status = 'open'`);
    const text = JSON.stringify(plan);
    expect(text).toContain('workflow_task_assignee_inbox_idx');
  });
});
