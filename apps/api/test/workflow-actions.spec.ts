import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/drizzle';
import { customer } from '../src/database/schema/customer';
import { account, staffProfile } from '../src/database/schema/iam';
import { location } from '../src/database/schema/org';
import { paymentIntent, recoveryCase } from '../src/database/schema/payment';
import { ratePlan } from '../src/database/schema/pricing';
import { reservation } from '../src/database/schema/reservation';
import { workflowBinding, workflowInstance } from '../src/database/schema/workflow';
import { PaymentService } from '../src/modules/payment/payment.service';
import { WorkflowRegistry } from '../src/modules/workflow/workflow-registry.service';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

// this file is about workflows, not re-authentication (every spec file shares one process environment)
const ORIGINAL_STEP_UP = process.env.STEP_UP_MAX_AGE_SEC;
process.env.STEP_UP_MAX_AGE_SEC = '900';

/**
 * Every action an owner can put an approval pipeline in front of: with nothing bound the action runs
 * exactly as before (the existing specs prove that); with a workflow bound the request is captured,
 * the right people are asked, and the change is applied once when they approve.
 */
describe('governed actions (phase 5)', () => {
  let app: Awaited<ReturnType<typeof getTestApp>>;
  let server: ReturnType<typeof httpServer>;
  let db: Database;
  let tok: Record<'admin' | 'manager' | 'finance' | 'agent' | 'customer', string>;
  const sid = {} as Record<'admin' | 'manager' | 'finance' | 'agent', string>;
  let n = 0;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (path: string, t = tok.admin) => request(server).get(path).set(auth(t));
  const post = (path: string, body: object = {}, t = tok.admin) =>
    request(server).post(path).set(auth(t)).send(body);
  const put = (path: string, body: object, t = tok.admin) =>
    request(server).put(path).set(auth(t)).send(body);
  const isoAt = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

  /** bind an approval by `who` (a staff short name) to an action; the requester is never `who` in these tests */
  const requireApprovalBy = async (
    actionKey: string,
    who: keyof typeof sid,
    extra: Record<string, unknown> = {},
  ) => {
    const code = `act_${Date.now().toString(36)}_${n++}`;
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
            actors: {
              selectors: [{ kind: 'user', staffProfileId: sid[who] }],
              mode: 'any',
              ...extra,
            },
            next: null,
          },
        },
        fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
      },
    }).expect(201);
    await post(`/api/v1/admin/workflows/definitions/${created.body.id}/publish`).expect(201);
    await put('/api/v1/admin/workflows/bindings', {
      actionKey,
      definitionId: created.body.id,
    }).expect(200);
  };
  const inbox = async (t: string) =>
    (await get('/api/v1/workflows/inbox', t).expect(200)).body as Array<{
      taskId: string;
      subjectId: string;
      actionKey: string;
    }>;
  const decideFor = async (
    t: string,
    subjectId: string,
    decision = 'approve',
    comment?: string,
  ) => {
    const item = (await inbox(t)).find((i) => i.subjectId === subjectId)!;
    expect(item, `a task for ${subjectId}`).toBeTruthy();
    return post(`/api/v1/workflows/tasks/${item.taskId}/decide`, { decision, comment }, t);
  };
  const isoIn = (days: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    d.setUTCHours(11, 0, 0, 0);
    return d.toISOString();
  };

  /** a confirmed, paid reservation at TST1 (24/7) */
  const book = async (pickupAt: string, returnAt: string) => {
    const quote = await request(server)
      .post('/api/v1/discovery/quote')
      .send({
        pickupLocationCode: 'TST1',
        pickupAt,
        returnAt,
        categoryCode: 'economy',
        holderKey: `wfa-${Math.random().toString(36).slice(2)}`,
      })
      .expect(201);
    const res = await request(server)
      .post('/api/v1/bookings/confirm')
      .set(auth(tok.customer))
      .send({
        quoteReference: quote.body.reference,
        drivers: [{ role: 'primary_renter', fullName: 'Test Customer', licenceNumber: 'D-A-1' }],
        acceptTerms: true,
        paymentToken: 'tok_visa_ok',
      })
      .expect(201);
    return res.body.reference as string;
  };

  beforeAll(async () => {
    app = await getTestApp();
    server = httpServer(app);
    db = app.get<Database>(DB);
    const login = async (email: string, aud: 'staff' | 'customer' = 'staff') =>
      (await signIn(app, email, 'Test-Passw0rd!', aud)).accessToken;
    tok = {
      admin: await login('test-admin@example.test'),
      manager: await login('test-manager@example.test'),
      finance: await login('test-finance@example.test'),
      agent: await login('test-agent@example.test'),
      customer: await login('test-customer@example.test', 'customer'),
    };
    for (const name of ['admin', 'manager', 'finance', 'agent'] as const) {
      const [row] = await db
        .select({ id: staffProfile.id })
        .from(account)
        .innerJoin(staffProfile, eq(staffProfile.accountId, account.id))
        .where(eq(account.email, `test-${name}@example.test`));
      sid[name] = row!.id;
    }
  });
  afterAll(async () => {
    if (ORIGINAL_STEP_UP === undefined) delete process.env.STEP_UP_MAX_AGE_SEC;
    else process.env.STEP_UP_MAX_AGE_SEC = ORIGINAL_STEP_UP;
    await closeTestApp();
  });
  beforeEach(async () => {
    await db.delete(workflowBinding);
  });

  it('every governed action is registered, with an executor', () => {
    const keys = app.get(WorkflowRegistry).list();
    expect(keys.map((a) => a.key)).toEqual(
      expect.arrayContaining([
        'config.version.publish',
        'template.publish',
        'customer.restriction.activate',
        'payment.refund',
        'reservation.cancel.withFee',
        'rateplan.publish',
        'translation.publish',
        'rental.extend',
        'location.archive',
        'customer.merge',
        'staff.access.change',
        'recovery.case.resolve',
      ]),
    );
    for (const a of keys) {
      expect(typeof a.execute, a.key).toBe('function');
      expect(typeof a.fingerprint, a.key).toBe('function');
      expect(a.variables, a.key).toBeInstanceOf(Array);
    }
  });

  // ───────────────────────── refunds ─────────────────────────

  it('a refund waits for approval when a workflow is bound, then refunds exactly once', async () => {
    const ref = await book(isoIn(400), isoIn(402));
    await requireApprovalBy('payment.refund', 'finance');
    const res = await post(
      `/api/v1/ops/reservations/${ref}/refund`,
      { amountMinor: 1000, note: 'goodwill' },
      tok.manager,
    ).expect(201);
    expect(res.body.pendingApproval).toBe(true);
    expect(res.body.workflow.stepName).toBe('Approve');
    const [before] = await db
      .select()
      .from(paymentIntent)
      .where(eq(paymentIntent.reservationReference, ref));
    expect(before!.refundedMinor).toBe(0); // nothing moved yet

    // a second request for the same reservation returns the open one
    const again = await post(
      `/api/v1/ops/reservations/${ref}/refund`,
      { amountMinor: 1000, note: 'goodwill' },
      tok.manager,
    ).expect(201);
    expect(again.body.workflow.instanceId).toBe(res.body.workflow.instanceId);

    await decideFor(tok.finance, ref).then((r) => expect(r.status).toBe(201));
    const [after] = await db
      .select()
      .from(paymentIntent)
      .where(eq(paymentIntent.reservationReference, ref));
    expect(after!.refundedMinor).toBe(1000);
    const [row] = await db.select().from(reservation).where(eq(reservation.reference, ref));
    expect(row!.paidMinor).toBe(before!.amountMinor - 1000);
  });

  it('an impossible refund is refused up front, before anyone is asked', async () => {
    const ref = await book(isoIn(410), isoIn(412));
    await requireApprovalBy('payment.refund', 'finance');
    await post(
      `/api/v1/ops/reservations/${ref}/refund`,
      { amountMinor: 99_999_999, note: 'too much' },
      tok.manager,
    )
      .expect(422)
      .expect((r) => expect(r.body.params.reason).toBe('over_refund'));
    expect(
      await db.select().from(workflowInstance).where(eq(workflowInstance.subjectId, ref)),
    ).toHaveLength(0);
  });

  it('a condition on the amount sends only large refunds for approval', async () => {
    const ref = await book(isoIn(420), isoIn(422));
    const code = `amt_${n++}`;
    const created = await post('/api/v1/admin/workflows/definitions', {
      code,
      name: code,
      spec: {
        start: 'ok',
        steps: {
          ok: {
            id: 'ok',
            name: 'Finance',
            type: 'approval',
            actors: { selectors: [{ kind: 'user', staffProfileId: sid.finance }], mode: 'any' },
            next: null,
          },
        },
        fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
      },
    }).expect(201);
    await post(`/api/v1/admin/workflows/definitions/${created.body.id}/publish`).expect(201);
    await put('/api/v1/admin/workflows/bindings', {
      actionKey: 'payment.refund',
      definitionId: created.body.id,
      condition: { '>': [{ var: 'amount' }, 5000] },
    }).expect(200);
    const small = await post(
      `/api/v1/ops/reservations/${ref}/refund`,
      { amountMinor: 500, note: 'small' },
      tok.manager,
    ).expect(201);
    expect(small.body.pendingApproval).toBeUndefined(); // direct
    const big = await post(
      `/api/v1/ops/reservations/${ref}/refund`,
      { amountMinor: 6000, note: 'big' },
      tok.manager,
    ).expect(201);
    expect(big.body.pendingApproval).toBe(true);
  });

  // ───────────────────────── cancellation with a fee ─────────────────────────

  it('a staff cancellation that carries a fee waits for approval; a customer’s own cancellation never does', async () => {
    await requireApprovalBy('reservation.cancel.withFee', 'finance');
    const staffRef = await book(isoAt(30), isoAt(54)); // inside the 48h free-cancellation window
    const pending = await post(
      `/api/v1/reservations/${staffRef}/cancel`,
      { reasonCode: 'goodwill' },
      tok.manager,
    ).expect(201);
    expect(pending.body.pendingApproval).toBe(true);
    const [still] = await db.select().from(reservation).where(eq(reservation.reference, staffRef));
    expect(still!.state).toBe('confirmed');
    await decideFor(tok.finance, staffRef);
    const [done] = await db.select().from(reservation).where(eq(reservation.reference, staffRef));
    expect(done!.state).toBe('cancelled');

    const ownRef = await book(isoAt(31), isoAt(55));
    const own = await post(`/api/v1/reservations/${ownRef}/cancel`, {}, tok.customer).expect(201);
    expect(own.body.pendingApproval).toBeUndefined();
    expect(own.body.state).toBe('cancelled');
  });

  it('a staff cancellation with no fee (outside the window) is not held', async () => {
    await requireApprovalBy('reservation.cancel.withFee', 'finance');
    const ref = await book(isoIn(430), isoIn(432));
    const r = await post(`/api/v1/reservations/${ref}/cancel`, {}, tok.manager).expect(201);
    expect(r.body.pendingApproval).toBeUndefined();
    expect(r.body.state).toBe('cancelled');
  });

  // ───────────────────────── recovery cases ─────────────────────────

  it('closing a recovery case can be put behind approval', async () => {
    const [prof] = await db
      .select({ org: staffProfile.organizationId })
      .from(staffProfile)
      .where(eq(staffProfile.id, sid.admin));
    const id = await app.get(PaymentService).openCase({
      organizationId: prof!.org,
      kind: 'reconcile',
      subjectType: 'reservation',
      subjectRef: 'RES-X',
      summary: 'ledger mismatch',
    });
    await requireApprovalBy('recovery.case.resolve', 'finance');
    const r = await post(`/api/v1/ops/cases/${id}/resolve`, {
      note: 'checked with the bank',
    }).expect(201);
    expect(r.body.pendingApproval).toBe(true);
    const [open] = await db.select().from(recoveryCase).where(eq(recoveryCase.id, id));
    expect(open!.state).toBe('open');
    await decideFor(tok.finance, id);
    const [closed] = await db.select().from(recoveryCase).where(eq(recoveryCase.id, id));
    expect(closed!.state).toBe('resolved');
    expect(closed!.resolutionNote).toBe('checked with the bank');
  });

  // ───────────────────────── rate plans ─────────────────────────

  it('a rate plan draft goes to review, is published on approval, and returns to draft if rejected', async () => {
    await requireApprovalBy('rateplan.publish', 'manager');
    const make = async (name: string) =>
      (
        await post('/api/v1/ops/pricing/rate-plans', {
          categoryCode: 'economy',
          baseDayMinor: 5000,
          minDurationHours: 24,
          taxBps: 2000,
          name,
          effectiveFrom: '2091-01-01',
        }).expect(201)
      ).body[0].id as string;
    const id = await make(`wf plan ${Date.now()}`);
    const res = await post(`/api/v1/ops/pricing/rate-plans/${id}/publish`).expect(201);
    expect(res.body.pendingApproval).toBe(true);
    expect((await db.select().from(ratePlan).where(eq(ratePlan.id, id)))[0]!.status).toBe(
      'in_review',
    );
    await decideFor(tok.manager, id);
    expect((await db.select().from(ratePlan).where(eq(ratePlan.id, id)))[0]!.status).toBe(
      'published',
    );

    const id2 = await make(`wf plan B ${Date.now()}`);
    await post(`/api/v1/ops/pricing/rate-plans/${id2}/publish`).expect(201);
    await decideFor(tok.manager, id2, 'reject', 'wrong prices');
    expect((await db.select().from(ratePlan).where(eq(ratePlan.id, id2)))[0]!.status).toBe('draft');
  });

  // ───────────────────────── translations ─────────────────────────

  it('publishing a language’s reviewed strings can be put behind approval', async () => {
    await requireApprovalBy('translation.publish', 'manager');
    await post('/api/v1/config/translations', {
      namespace: 'common',
      key: 'action.search',
      localeCode: 'fr',
      value: 'Rechercher (relu)',
      status: 'in_review',
    }).expect(201);
    const res = await post('/api/v1/config/translations/common/fr/publish').expect(201);
    expect(res.body.pendingApproval).toBe(true);
    await decideFor(tok.manager, 'common:fr');
    const bundle = await get('/api/v1/meta/translations?namespace=common&locale=fr').expect(200);
    expect(bundle.body['action.search']).toBe('Rechercher (relu)');
  });

  // ───────────────────────── locations ─────────────────────────

  it('archiving a location waits for approval; restoring one does not', async () => {
    await post('/api/v1/ops/locations', {
      code: 'WFA1',
      name: 'Workflow test',
      timezone: 'America/New_York',
      regularHours: [{ day: 1, open: '08:00', close: '18:00' }],
      supportedCategoryCodes: ['economy'],
    }).expect(201);
    await requireApprovalBy('location.archive', 'manager');
    const res = await post('/api/v1/ops/locations/WFA1/archive').expect(201);
    expect(res.body.pendingApproval).toBe(true);
    expect((await db.select().from(location).where(eq(location.code, 'WFA1')))[0]!.status).not.toBe(
      'archived',
    );
    await decideFor(tok.manager, 'WFA1');
    expect((await db.select().from(location).where(eq(location.code, 'WFA1')))[0]!.status).toBe(
      'archived',
    );
    const restored = await post('/api/v1/ops/locations/WFA1/restore').expect(201);
    expect(restored.body.pendingApproval).toBeUndefined();
  });

  // ───────────────────────── customer merge ─────────────────────────

  it('merging two customers waits for approval, then merges', async () => {
    const found = await get('/api/v1/ops/customers?q=Test%20Customer').expect(200);
    const rows = found.body.results as Array<{ id: string; fullName: string }>;
    const survivor = rows.find((r) => r.fullName === 'Test Customer')!.id;
    const dup = rows.find((r) => r.fullName === 'Test Customer II')!.id;
    await requireApprovalBy('customer.merge', 'manager');
    const res = await post(`/api/v1/ops/customers/${dup}/merge`, {
      intoId: survivor,
      reason: 'same person',
    }).expect(201);
    expect(res.body.pendingApproval).toBe(true);
    expect((await db.select().from(customer).where(eq(customer.id, dup)))[0]!.status).not.toBe(
      'merged',
    );
    await decideFor(tok.manager, dup);
    expect((await db.select().from(customer).where(eq(customer.id, dup)))[0]!.status).toBe(
      'merged',
    );
  });

  // ───────────────────────── staff access (security-critical) ─────────────────────────

  it('a change to someone’s access can never be approved by that person, whatever the workflow says', async () => {
    // the workflow asks finance OR manager — but the change is ABOUT finance
    const code = `sec_${n++}`;
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
            actors: {
              selectors: [
                { kind: 'user', staffProfileId: sid.finance },
                { kind: 'user', staffProfileId: sid.manager },
              ],
              mode: 'any',
            },
            next: null,
          },
        },
        fallbackActors: [{ kind: 'role', roleCode: 'administrator' }],
      },
    }).expect(201);
    await post(`/api/v1/admin/workflows/definitions/${created.body.id}/publish`).expect(201);
    await put('/api/v1/admin/workflows/bindings', {
      actionKey: 'staff.access.change',
      definitionId: created.body.id,
    }).expect(200);

    const [fin] = await db
      .select({ acc: staffProfile.accountId })
      .from(staffProfile)
      .where(eq(staffProfile.id, sid.finance));
    const res = await post(`/api/v1/admin/staff/${fin!.acc}/access`, {
      roleCodes: ['finance_staff', 'rental_agent'],
    }).expect(201);
    expect(res.body.pendingApproval).toBe(true);

    expect((await inbox(tok.finance)).some((i) => i.subjectId === fin!.acc)).toBe(false); // never asked
    const item = (await inbox(tok.manager)).find((i) => i.subjectId === fin!.acc)!;
    expect(item).toBeTruthy();
    await post(
      `/api/v1/workflows/tasks/${item.taskId}/decide`,
      { decision: 'approve' },
      tok.finance,
    ).expect(403);
    await post(
      `/api/v1/workflows/tasks/${item.taskId}/decide`,
      { decision: 'approve' },
      tok.manager,
    ).expect(201);
    const after = await get(`/api/v1/admin/staff/${fin!.acc}/access`).expect(200);
    expect(after.body.effective.roleCodes).toEqual(
      expect.arrayContaining(['finance_staff', 'rental_agent']),
    );
  });
});
