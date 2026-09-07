import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { reportDefinition, reportRun, reportSchedule } from '../../database/schema/admin';
import { vehicleUnit } from '../../database/schema/fleet';
import { organization } from '../../database/schema/org';
import { paymentIntent, recoveryCase } from '../../database/schema/payment';
import { reservation, reconciliationException } from '../../database/schema/reservation';

@Injectable()
export class ReportService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
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

  async getRun(actor: Actor, runId: string) {
    const [row] = await this.db.select().from(reportRun).where(eq(reportRun.id, runId)).limit(1);
    if (!row) throw AppError.notFound('report run');
    if (actor.kind !== 'staff') throw AppError.forbidden();
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

  async listRuns(code?: string) {
    const rows = await this.db
      .select({
        id: reportRun.id,
        definitionCode: reportRun.definitionCode,
        rowCount: reportRun.rowCount,
        scopeNote: reportRun.scopeNote,
        createdAt: reportRun.createdAt,
      })
      .from(reportRun)
      .where(code ? eq(reportRun.definitionCode, code) : sql`true`)
      .orderBy(desc(reportRun.createdAt))
      .limit(50);
    return rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() }));
  }
}
