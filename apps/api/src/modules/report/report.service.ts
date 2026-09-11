import { Inject, Injectable } from '@nestjs/common';
import { parseExpression } from 'cron-parser';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import { RbacService } from '../../common/auth/rbac.service';
import type { Actor } from '../../common/auth/types';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { reportDefinition, reportRun, reportSchedule } from '../../database/schema/admin';
import { vehicleUnit } from '../../database/schema/fleet';
import { account, staffProfile } from '../../database/schema/iam';
import { organization } from '../../database/schema/org';
import { payment, paymentIntent, recoveryCase } from '../../database/schema/payment';
import { rental } from '../../database/schema/rental';
import { reservation, reconciliationException } from '../../database/schema/reservation';
import { NotifyService } from '../notify/notify.service';

@Injectable()
export class ReportService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    private readonly outbox: OutboxService,
    private readonly notify: NotifyService,
  ) {}

  private async orgId(): Promise<string> {
    const [org] = await this.db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) throw new AppError('resource_not_found', { title: 'No organization configured' });
    return org.id;
  }

  async listDefinitions() {
    return this.db.select().from(reportDefinition).orderBy(asc(reportDefinition.code));
  }

  /**
   * FR-RPT-004 — a staff actor confined to a set of locations only sees rows for those pickup
   * locations, even when their role is otherwise org-wide. `locationScope` holds location codes
   * (matches `reservation.pickup_location_code`). Empty scope = all locations.
   */
  private scopeCodes(actor: Actor): string[] | null {
    return actor.locationScope?.length ? actor.locationScope : null;
  }

  async run(actor: Actor, code: string, params: Record<string, unknown> = {}) {
    const [def] = await this.db
      .select()
      .from(reportDefinition)
      .where(eq(reportDefinition.code, code))
      .limit(1);
    if (!def) throw AppError.notFound('report');
    if (def.minPermission && !(actor.permissions ?? []).includes(def.minPermission)) {
      throw AppError.forbidden(`This report requires ${def.minPermission}`);
    }

    const orgId = await this.orgId();
    const scope = this.scopeCodes(actor);
    const scopeNote = scope ? `Scoped to ${scope.join(', ')}` : 'All locations';

    let rows: Array<Record<string, unknown>> = [];
    switch (def.queryKind) {
      case 'reservations_by_state': {
        const q = this.db
          .select({
            state: reservation.state,
            count: sql<number>`count(*)::int`,
            totalMinor: sql<number>`coalesce(sum(${reservation.totalMinor}),0)::int`,
          })
          .from(reservation)
          .where(scope ? inArray(reservation.pickupLocationCode, scope) : sql`true`)
          .groupBy(reservation.state);
        rows = (await q).map((r) => ({ ...r }));
        break;
      }
      case 'revenue_by_category': {
        const earned = inArray(reservation.state, ['confirmed', 'fulfilled']);
        const q = this.db
          .select({
            categoryCode: reservation.categoryCode,
            reservations: sql<number>`count(*)::int`,
            revenueMinor: sql<number>`coalesce(sum(${reservation.totalMinor}),0)::int`,
          })
          .from(reservation)
          .where(scope ? and(earned, inArray(reservation.pickupLocationCode, scope)) : earned)
          .groupBy(reservation.categoryCode);
        rows = (await q).map((r) => ({ ...r }));
        break;
      }
      case 'fleet_utilisation': {
        const q = this.db
          .select({ state: vehicleUnit.state, units: sql<number>`count(*)::int` })
          .from(vehicleUnit)
          .where(eq(vehicleUnit.organizationId, orgId))
          .groupBy(vehicleUnit.state);
        rows = (await q).map((r) => ({ ...r }));
        break;
      }
      case 'refunds': {
        const [r] = await this.db
          .select({
            refundedMinor: sql<number>`coalesce(sum(${paymentIntent.refundedMinor}),0)::int`,
            intents: sql<number>`(count(*) filter (where ${paymentIntent.refundedMinor} > 0))::int`,
          })
          .from(paymentIntent)
          .where(eq(paymentIntent.organizationId, orgId));
        rows = [{ refundedMinor: r?.refundedMinor ?? 0, intents: r?.intents ?? 0 }];
        break;
      }
      case 'open_cases': {
        const [cases] = await this.db
          .select({ n: sql<number>`count(*)::int` })
          .from(recoveryCase)
          .where(sql`${recoveryCase.state} <> 'resolved'`);
        const [exc] = await this.db
          .select({ n: sql<number>`count(*)::int` })
          .from(reconciliationException)
          .where(eq(reconciliationException.state, 'open'));
        rows = [
          { kind: 'recovery_case', open: cases?.n ?? 0 },
          { kind: 'reconciliation_exception', open: exc?.n ?? 0 },
        ];
        break;
      }
      default:
        throw AppError.businessRule(`Unknown report query kind: ${def.queryKind}`, {
          reason: 'unknown_query',
        });
    }

    const [savedRun] = await this.db
      .insert(reportRun)
      .values({
        organizationId: orgId,
        definitionCode: code,
        params,
        status: 'complete',
        rowCount: rows.length,
        result: rows,
        scopeNote,
        locationScope: scope ?? [],
        createdBy: actor.accountId,
      })
      .returning({ id: reportRun.id });

    await this.audit.record({
      action: 'report.run',
      targetType: 'report',
      targetId: code,
      actor,
      after: { rowCount: rows.length, scopeNote },
    });

    return {
      runId: savedRun!.id,
      code,
      title: def.title,
      columns: (def.columns as string[]) ?? Object.keys(rows[0] ?? {}),
      rows,
      rowCount: rows.length,
      scopeNote,
    };
  }

  /**
   * SCREEN-OPS-002 — the operational dashboard aggregate. Read-only counts for the `/ops`
   * landing cards: today's pickups / returns (with a done/total split), overdue rentals, the
   * assignment queue, finance/integration exceptions, and the fleet-readiness breakdown.
   * Rental + reservation counts are confined to the actor's `locationScope` (FR-RPT-004);
   * fleet + finance exceptions are org-wide (units belong to the org; payment issues carry no
   * location). A metric that cannot be read is `null`, never `0` (FR-RPT-001) — the caller
   * surfaces "unavailable".
   */
  async opsDashboard(actor: Actor) {
    const orgId = await this.orgId();
    const scope = this.scopeCodes(actor);
    const scopeNote = scope ? `Scoped to ${scope.join(', ')}` : 'All locations';
    // parameterised `= any($1)` list, or `true` when the scope is org-wide
    const inPickup = scope ? sql`${rental.pickupLocationCode} = any(${scope})` : sql`true`;
    const inReturn = scope ? sql`${rental.returnLocationCode} = any(${scope})` : sql`true`;
    const inResPickup = scope ? sql`${reservation.pickupLocationCode} = any(${scope})` : sql`true`;

    const [pickups] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        done: sql<number>`(count(*) filter (where ${rental.pickedUpAt} is not null))::int`,
      })
      .from(rental)
      .where(and(sql`${rental.scheduledPickupAt}::date = current_date`, inPickup));

    const [returns] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        done: sql<number>`(count(*) filter (where ${rental.returnedAt} is not null))::int`,
      })
      .from(rental)
      .where(and(sql`${rental.scheduledReturnAt}::date = current_date`, inReturn));

    const [overdue] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(rental)
      .where(and(eq(rental.state, 'overdue'), inReturn));

    // confirmed reservations picking up today that don't yet have a rental — the assign queue
    const [queue] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(reservation)
      .where(
        and(
          eq(reservation.state, 'confirmed'),
          sql`${reservation.pickupAt}::date <= current_date`,
          inResPickup,
          sql`not exists (select 1 from rental r where r.reservation_reference = ${reservation.reference})`,
        ),
      );

    const [cases] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(recoveryCase)
      .where(sql`${recoveryCase.state} <> 'resolved'`);
    const [exc] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(reconciliationException)
      .where(eq(reconciliationException.state, 'open'));

    const fleetRows = await this.db
      .select({ state: vehicleUnit.state, n: sql<number>`count(*)::int` })
      .from(vehicleUnit)
      .where(eq(vehicleUnit.organizationId, orgId))
      .groupBy(vehicleUnit.state);
    const fleet = { available: 0, on_rent: 0, prep: 0, maintenance: 0, other: 0 };
    for (const r of fleetRows) {
      if (r.state in fleet) fleet[r.state as keyof typeof fleet] = r.n;
      else fleet.other += r.n;
    }
    const fleetTotal =
      fleet.available + fleet.on_rent + fleet.prep + fleet.maintenance + fleet.other;
    // fleet utilisation = share of the fleet currently on rent, 0..100 (null when there are no units)
    const utilisation = fleetTotal > 0 ? Math.round((fleet.on_rent / fleetTotal) * 100) : null;

    // net cash captured today — successful captures minus refunds from the payment ledger (the
    // per-transaction source of truth), org-wide (payments carry no location). Reported in the
    // org's default currency.
    const [org] = await this.db
      .select({ currency: organization.defaultCurrency })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);
    const [revenue] = await this.db
      .select({
        minor: sql<number>`coalesce(sum(${payment.amountMinor}) filter (where ${payment.type} = 'capture'), 0)::int
          - coalesce(sum(${payment.amountMinor}) filter (where ${payment.type} = 'refund'), 0)::int`,
      })
      .from(payment)
      .innerJoin(paymentIntent, eq(paymentIntent.id, payment.intentId))
      .where(
        and(
          eq(paymentIntent.organizationId, orgId),
          eq(payment.outcome, 'succeeded'),
          sql`${payment.createdAt}::date = current_date`,
        ),
      );

    // reservations cancelled or marked no-show today (location-scoped like the other counts)
    const [cancellations] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(reservation)
      .where(
        and(
          inArray(reservation.state, ['cancelled', 'no_show']),
          sql`coalesce(${reservation.cancelledAt}, ${reservation.updatedAt})::date = current_date`,
          inResPickup,
        ),
      );

    return {
      checkedAt: new Date().toISOString(),
      scopeNote,
      pickupsToday: { total: pickups?.total ?? 0, done: pickups?.done ?? 0 },
      returnsToday: { total: returns?.total ?? 0, done: returns?.done ?? 0 },
      overdue: overdue?.n ?? 0,
      assignQueue: queue?.n ?? 0,
      cancellationsToday: cancellations?.n ?? 0,
      revenueToday: { minor: revenue?.minor ?? 0, currency: org?.currency ?? 'USD' },
      financeExceptions: {
        recoveryCases: cases?.n ?? 0,
        reconciliation: exc?.n ?? 0,
        total: (cases?.n ?? 0) + (exc?.n ?? 0),
      },
      fleet,
      fleetTotal,
      utilisation,
    };
  }

  /**
   * FR-RPT-004 read-time enforcement — `run()` only ever confines the *query* to the requesting
   * actor's own locations; without this, a scoped actor could still browse/export *any* other
   * staff member's already-generated run (via the shared `listRuns`/export surface) and see data
   * for locations outside their scope. A scoped actor may read: their own past runs (whatever
   * scope they were made under), or any run whose stored scope is entirely inside their own —
   * never an org-wide run (empty scope) or one covering a location they're not allowed to see.
   */
  private canViewRun(
    actor: Actor,
    run: { createdBy: string | null; locationScope: unknown },
  ): boolean {
    if (!actor.locationScope?.length) return true;
    if (run.createdBy === actor.accountId) return true;
    const runScope = (run.locationScope as string[] | null) ?? [];
    if (!runScope.length) return false;
    return runScope.every((c) => actor.locationScope!.includes(c));
  }

  async getRun(actor: Actor, runId: string) {
    const [row] = await this.db.select().from(reportRun).where(eq(reportRun.id, runId)).limit(1);
    if (!row) throw AppError.notFound('report run');
    if (actor.kind !== 'staff') throw AppError.forbidden();
    if (!this.canViewRun(actor, row)) {
      throw AppError.forbidden('This report run covers locations outside your scope');
    }
    return row;
  }

  async exportCsv(actor: Actor, runId: string): Promise<string> {
    const run = await this.getRun(actor, runId);
    const rows = (run.result as Array<Record<string, unknown>>) ?? [];
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]!);
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  }

  async schedule(
    actor: Actor,
    input: {
      definitionCode: string;
      cron: string;
      params?: Record<string, unknown>;
      recipients: string[];
    },
  ) {
    // Previously unchecked — a typo'd or since-removed `definitionCode` saved a schedule that
    // looked fine in the list but could never actually run: `run()` throws `resource_not_found`
    // the first time anything tries to dispatch it. Fail fast at creation time instead.
    const [def] = await this.db
      .select({ code: reportDefinition.code })
      .from(reportDefinition)
      .where(eq(reportDefinition.code, input.definitionCode))
      .limit(1);
    if (!def) throw AppError.notFound('report');

    // Same reasoning: an unparseable cron used to save fine and simply never fire — now that a
    // dispatcher actually reads this field (dispatchDueSchedules), a bad expression is a request
    // error, not a silent no-op discovered days later.
    if (nextFireAfter(input.cron, new Date()) === null) {
      throw AppError.validation([{ path: 'cron', code: 'invalid_cron' }]);
    }

    const orgId = await this.orgId();
    const [row] = await this.db
      .insert(reportSchedule)
      .values({
        organizationId: orgId,
        definitionCode: input.definitionCode,
        cron: input.cron,
        params: input.params ?? {},
        recipients: input.recipients,
        createdBy: actor.accountId,
      })
      .returning();
    await this.audit.record({
      action: 'report.scheduled',
      targetType: 'report_schedule',
      targetId: row!.id,
      actor,
      after: { definitionCode: input.definitionCode, recipients: input.recipients.length },
    });
    return row;
  }

  async listSchedules() {
    return this.db.select().from(reportSchedule).orderBy(desc(reportSchedule.createdAt)).limit(100);
  }

  /**
   * FR-RPT-006 — dispatch a scheduled report **now**, re-checking the owner's authority at send
   * time (SRS-SEC-014). If the account that created the schedule is no longer an active staff
   * member holding `report.export`, the delivery is skipped, the schedule is paused and the
   * reason recorded on `last_skip_reason` — a scheduler tick would do exactly this. Otherwise the
   * report is run under the owner's location scope and delivered the same way every other
   * message in the system is: one `NotifyService.send()` per recipient (this project has no real
   * outbound carrier anywhere — DEC/S7-DEF-002 — a `notification` row *is* "delivered"). The
   * `report.delivery.v1` outbox event stays as the durable audit trail alongside it, not as the
   * only delivery attempt — previously it was the *only* thing this method did, so nothing was
   * ever actually sent to `recipients` despite the response claiming `sent: true`.
   *
   * `actor` is `null` for the automated dispatcher tick (`dispatchDueSchedules`) — there is no
   * human to attribute the audit trail to, so it records as `actorType: 'system'`
   * (`AuditService.record` already has that fallback). The owner-authority check is always
   * against the schedule's `createdBy`, never against `actor` — an automated call is exactly as
   * safe as a manual one.
   */
  async sendScheduleNow(actor: Actor | null, id: string) {
    const orgId = await this.orgId();
    const [sch] = await this.db
      .select()
      .from(reportSchedule)
      .where(and(eq(reportSchedule.id, id), eq(reportSchedule.organizationId, orgId)))
      .limit(1);
    if (!sch) throw AppError.notFound('report schedule');

    const owner = await this.resolveScheduleOwner(sch.createdBy);
    if (!owner) {
      await this.db
        .update(reportSchedule)
        .set({
          isActive: 'false',
          lastSkipReason: 'owner_not_authorized',
          lastRunAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(reportSchedule.id, id));
      await this.audit.record({
        action: 'report.schedule.skipped',
        targetType: 'report_schedule',
        targetId: id,
        actor,
        after: { reason: 'owner_not_authorized', owner: sch.createdBy },
      });
      return { sent: false, reason: 'owner_not_authorized' as const };
    }

    const run = await this.run(owner, sch.definitionCode, sch.params);
    for (const recipient of sch.recipients) {
      await this.notify.send({
        event: 'admin.report.delivered',
        recipient,
        fallback: {
          subject: `${run.title} — report`,
          body:
            `Your scheduled report "${run.title}" ran with ${run.rowCount} row(s). ` +
            `Scope: ${run.scopeNote}. Sign in to the operations console → Insights to view or ` +
            `export the full data.`,
        },
        sourceType: 'report_run',
        sourceId: run.runId,
      });
    }
    await this.outbox.emit({
      type: 'report.delivery.v1',
      aggregateType: 'report_schedule',
      aggregateId: id,
      payload: {
        runId: run.runId,
        definitionCode: sch.definitionCode,
        recipients: sch.recipients,
        rowCount: run.rowCount,
      },
    });
    await this.db
      .update(reportSchedule)
      .set({ lastRunAt: sql`now()`, lastSkipReason: null, updatedAt: sql`now()` })
      .where(eq(reportSchedule.id, id));
    await this.audit.record({
      action: 'report.schedule.sent',
      targetType: 'report_schedule',
      targetId: id,
      actor,
      after: { runId: run.runId, recipients: sch.recipients.length },
    });
    return { sent: true as const, runId: run.runId, recipients: sch.recipients };
  }

  /** The Actor the schedule runs as, or `null` if that account may no longer receive it. */
  private async resolveScheduleOwner(accountId: string | null): Promise<Actor | null> {
    if (!accountId) return null;
    const [acc] = await this.db.select().from(account).where(eq(account.id, accountId)).limit(1);
    if (!acc || acc.status !== 'active' || acc.kind !== 'staff') return null;
    const [profile] = await this.db
      .select()
      .from(staffProfile)
      .where(eq(staffProfile.accountId, accountId))
      .limit(1);
    if (!profile || profile.status !== 'active') return null;
    const permissions = await this.rbac.resolvePermissions(profile.roleCodes);
    if (!permissions.includes('report.export')) return null;
    return {
      accountId: acc.id,
      kind: 'staff',
      audience: 'staff',
      displayName: acc.displayName,
      localeCode: acc.localeCode,
      staffProfileId: profile.id,
      organizationId: profile.organizationId,
      permissions,
      roleCodes: profile.roleCodes,
      locationScope: profile.locationScope,
      approvalLimitMinor: profile.approvalLimitMinor,
      tokenId: 'schedule-dispatch',
    };
  }

  async listRuns(actor: Actor, code?: string) {
    const rows = await this.db
      .select({
        id: reportRun.id,
        definitionCode: reportRun.definitionCode,
        rowCount: reportRun.rowCount,
        scopeNote: reportRun.scopeNote,
        locationScope: reportRun.locationScope,
        createdBy: reportRun.createdBy,
        createdAt: reportRun.createdAt,
      })
      .from(reportRun)
      .where(code ? eq(reportRun.definitionCode, code) : sql`true`)
      .orderBy(desc(reportRun.createdAt))
      .limit(50);
    // same FR-RPT-004 read guard as getRun/exportCsv — the "recent runs" list must not surface
    // (or even hint at, via rowCount/scopeNote) a run outside the viewer's own location scope.
    return rows
      .filter((r) => this.canViewRun(actor, r))
      .map(({ locationScope: _locationScope, createdBy: _createdBy, ...r }) => ({
        ...r,
        createdAt: new Date(r.createdAt).toISOString(),
      }));
  }

  /**
   * FR-RPT-006 automated dispatch — the worker tick's entry point (once a minute; see
   * `worker.ts`). Finds every active schedule whose next cron occurrence (after its last run, or
   * after it was created if never run) has arrived, and sends it via `sendScheduleNow` — the
   * exact same owner-re-check / run / notify / outbox path a manual "Send now" click uses, so
   * automated and manual dispatch can never drift apart into two different behaviors.
   */
  async dispatchDueSchedules(now: Date): Promise<{ checked: number; dispatched: string[] }> {
    const active = await this.db
      .select({
        id: reportSchedule.id,
        cron: reportSchedule.cron,
        lastRunAt: reportSchedule.lastRunAt,
        createdAt: reportSchedule.createdAt,
      })
      .from(reportSchedule)
      .where(eq(reportSchedule.isActive, 'true'));
    const dispatched: string[] = [];
    for (const sch of active) {
      const baseline = sch.lastRunAt ?? sch.createdAt;
      if (!isScheduleDue(sch.cron, baseline, now)) continue;
      // a null actor records this audit trail as system-triggered (AuditService already has a
      // 'system' actorType fallback for exactly this) — there is no human to attribute it to.
      await this.sendScheduleNow(null, sch.id);
      dispatched.push(sch.id);
    }
    return { checked: active.length, dispatched };
  }
}

/** The cron expression's next occurrence strictly after `baseline`, or `null` for a malformed
 *  expression (never fires — matches `schedule()`'s own creation-time validation, which should
 *  make this unreachable in practice, but a tick must not throw over one bad row). */
export function nextFireAfter(cron: string, baseline: string | Date): Date | null {
  try {
    return parseExpression(cron, { currentDate: baseline, utc: true }).next().toDate();
  } catch {
    return null;
  }
}

/** Whether a schedule last run (or created, if never run) at `baseline` has a cron occurrence due
 *  by `now`. Exported standalone (no DB) so the dispatch-timing logic itself — the part worth
 *  getting exactly right — has fast, deterministic unit coverage. */
export function isScheduleDue(cron: string, baseline: string | Date, now: Date): boolean {
  const next = nextFireAfter(cron, baseline);
  return next !== null && next.getTime() <= now.getTime();
}
