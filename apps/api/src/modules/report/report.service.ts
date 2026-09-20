import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { parseExpression } from 'cron-parser';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { decodeAuditCursor, encodeAuditCursor } from '../../common/audit/audit-cursor';
import { AuditService } from '../../common/audit/audit.service';
import { AccessService } from '../../common/auth/access.service';
import { effectiveLocationCodes } from '../../common/auth/location-scope';
import type { Actor } from '../../common/auth/types';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import {
  dataQualityFinding,
  reportDefinition,
  reportRun,
  reportSchedule,
} from '../../database/schema/admin';
import { vehicleUnit } from '../../database/schema/fleet';
import { account, staffProfile } from '../../database/schema/iam';
import { location, organization } from '../../database/schema/org';
import { payment, paymentIntent, recoveryCase } from '../../database/schema/payment';
import { auditEvent } from '../../database/schema/platform';
import { rental } from '../../database/schema/rental';
import { reservation, reconciliationException } from '../../database/schema/reservation';
import { NotifyService } from '../notify/notify.service';

/**
 * How each `report_definition.queryKind` relates to a location scope:
 *  - `location`: every row traces to a branch (reservation pickup, a car's current branch, the
 *    reservation a payment belongs to), so it can be narrowed to the actor's / the requested
 *    locations;
 *  - `org_wide`: rows have no reliable branch (recovery cases reference polymorphic subjects, the
 *    data-quality sweep inspects the whole database). A location-scoped actor is REFUSED these
 *    rather than shown organisation-wide numbers under a "Scoped to X" label.
 * A new query kind must be listed here — an unlisted kind is treated as `org_wide`.
 */
export const REPORT_SCOPE: Record<string, 'location' | 'org_wide'> = {
  reservations_by_state: 'location',
  revenue_by_category: 'location',
  fleet_utilisation: 'location',
  refunds: 'location',
  open_cases: 'org_wide',
  data_quality_sweep: 'org_wide',
};
export const reportScopeOf = (queryKind: string): 'location' | 'org_wide' =>
  REPORT_SCOPE[queryKind] ?? 'org_wide';

@Injectable()
export class ReportService {
  private readonly logger = new Logger('ReportService');

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly outbox: OutboxService,
    private readonly notify: NotifyService,
  ) {}

  private async orgId(): Promise<string> {
    const [org] = await this.db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) throw new AppError('resource_not_found', { title: 'No organization configured' });
    return org.id;
  }

  /** Definitions plus how each relates to a location scope, so the UI can label / disable them. */
  async listDefinitions(actor?: Actor) {
    const rows = await this.db.select().from(reportDefinition).orderBy(asc(reportDefinition.code));
    const scoped = !!actor && this.scopeCodes(actor) !== null;
    return rows.map((d) => {
      const scope = reportScopeOf(d.queryKind);
      return { ...d, scope, available: !(scoped && scope === 'org_wide') };
    });
  }

  /**
   * FR-RPT-004 — a staff actor confined to a set of locations only sees rows for those pickup
   * locations, even when their role is otherwise org-wide. `locationScope` holds location codes
   * (matches `reservation.pickup_location_code`). Empty scope = all locations.
   */
  private scopeCodes(actor: Actor): string[] | null {
    return actor.locationScope?.length ? actor.locationScope : null;
  }

  /**
   * The actor's own permission scope, narrowed by an optional caller-requested location — never
   * a *replacement* of the actor's scope, since the request is never trusted to broaden it. A
   * requested code outside the actor's own scope is rejected with an explicit 403
   * (`assertLocationAccess`, SRS-SEC-007) rather than silently narrowed to zero rows — a
   * scope violation must be visible and actionable, not indistinguishable from "no data."
   */
  private effectiveScope(actor: Actor, requested?: string | string[]): string[] | null {
    return effectiveLocationCodes(actor, requested);
  }

  /** `null` scope reads as "All locations"; a non-empty scope (this method's only other possible
   *  input — an out-of-scope request is rejected before it ever reaches here) names it. */
  private scopeNoteFor(scope: string[] | null): string {
    return scope ? `Scoped to ${scope.join(', ')}` : 'All locations';
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
    // `params.locationCode` narrows *within* the actor's own scope, same as the dashboard
    // endpoints above — never a replacement of it. Only applied for `reservations_by_state` and
    // `revenue_by_category` (the only two query kinds keyed by `pickupLocationCode`) — every
    // other kind ignores it entirely, so `scope`/`scopeNote` must too, or a caller narrowed to
    // one location while running e.g. `fleet_utilisation` (genuinely org-wide, no location
    // column at all) would see "Scoped to X" on numbers that were never actually filtered by X.
    const requestedLocation =
      typeof params.locationCode === 'string' ? params.locationCode : undefined;
    let scope: string[] | null;
    if (reportScopeOf(def.queryKind) === 'location') {
      scope = this.effectiveScope(actor, requestedLocation);
    } else {
      // org-wide data can't be attributed to a branch — never hand it to a branch-scoped actor
      if (this.scopeCodes(actor) !== null) {
        throw AppError.forbidden(
          'This report covers the whole organisation, so it needs an account that is not limited to specific locations',
        );
      }
      scope = null;
    }
    const scopeNote = this.scopeNoteFor(scope);

    let rows: Array<Record<string, unknown>> = [];
    switch (def.queryKind) {
      case 'reservations_by_state': {
        const q = this.db
          .select({
            state: reservation.state,
            currency: reservation.currency,
            count: sql<number>`count(*)::int`,
            totalMinor: sql<number>`coalesce(sum(${reservation.totalMinor}),0)::int`,
          })
          .from(reservation)
          .where(scope ? inArray(reservation.pickupLocationCode, scope) : sql`true`)
          // money is never added across currencies: one row per state and currency
          .groupBy(reservation.state, reservation.currency)
          .orderBy(sql`count(*) desc`, reservation.state);
        rows = (await q).map((r) => ({ ...r }));
        break;
      }
      case 'revenue_by_category': {
        const earned = inArray(reservation.state, ['confirmed', 'fulfilled']);
        const q = this.db
          .select({
            categoryCode: reservation.categoryCode,
            currency: reservation.currency,
            reservations: sql<number>`count(*)::int`,
            revenueMinor: sql<number>`coalesce(sum(${reservation.totalMinor}),0)::int`,
          })
          .from(reservation)
          .where(scope ? and(earned, inArray(reservation.pickupLocationCode, scope)) : earned)
          .groupBy(reservation.categoryCode, reservation.currency)
          .orderBy(sql`sum(${reservation.totalMinor}) desc`, reservation.categoryCode);
        rows = (await q).map((r) => ({ ...r }));
        break;
      }
      case 'fleet_utilisation': {
        const q = this.db
          .select({ state: vehicleUnit.state, units: sql<number>`count(*)::int` })
          .from(vehicleUnit)
          .innerJoin(location, eq(location.id, vehicleUnit.currentLocationId))
          .where(
            scope
              ? and(eq(vehicleUnit.organizationId, orgId), inArray(location.code, scope))
              : eq(vehicleUnit.organizationId, orgId),
          )
          .groupBy(vehicleUnit.state)
          .orderBy(sql`count(*) desc`, vehicleUnit.state);
        rows = (await q).map((r) => ({ ...r }));
        break;
      }
      case 'refunds': {
        const q = this.db
          .select({
            currency: paymentIntent.currency,
            refundedMinor: sql<number>`coalesce(sum(${paymentIntent.refundedMinor}),0)::int`,
            intents: sql<number>`(count(*) filter (where ${paymentIntent.refundedMinor} > 0))::int`,
          })
          .from(paymentIntent)
          .leftJoin(reservation, eq(reservation.reference, paymentIntent.reservationReference))
          .where(
            scope
              ? and(
                  eq(paymentIntent.organizationId, orgId),
                  inArray(reservation.pickupLocationCode, scope),
                )
              : eq(paymentIntent.organizationId, orgId),
          )
          .groupBy(paymentIntent.currency)
          .orderBy(paymentIntent.currency);
        // a currency with no refund at all is noise; an empty result reads "nothing refunded"
        rows = (await q).filter((r) => r.intents > 0).map((r) => ({ ...r }));
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
      case 'data_quality_sweep': {
        // reuses this same generic run/schedule/export/notify machinery (FR-RPT-006 automation —
        // instead of building a parallel scheduler+notifier for data quality, one more
        // `report_definition` row on the system already built and hardened for report_schedule
        // (PR #81-83): cron dispatch, atomic claim against a double-fire, per-schedule failure
        // isolation, "send now" with step-up, CSV export, and run history for free.
        const report = await this.dataQuality();
        rows = report.checks.map((c) => ({
          id: c.id,
          title: c.title,
          severity: c.severity,
          count: c.count,
          state: c.findingState,
          sample: c.sample.join('; '),
          error: c.error ?? '',
        }));
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
   * assignment queue, revenue, finance/integration exceptions, and the fleet-readiness breakdown.
   * Rental + reservation counts are confined to the actor's `locationScope` (FR-RPT-004); so is
   * the fleet breakdown (via `vehicleUnit.currentLocationId` -> `location.code`) and revenue
   * (via `paymentIntent.reservationReference` -> `reservation.pickupLocationCode` — payments
   * carry no location column of their own, but every one traces back to the reservation it was
   * collected for). `financeExceptions` stays org-wide (and is withheld, `null`, from location-scoped actors): `recoveryCase.subjectRef` is a
   * polymorphic reference whose meaning (and therefore location) varies by `kind`, so it can't be
   * reliably attributed to one location without per-kind resolution logic — a known, disclosed
   * gap rather than a silently-wrong number. A metric that cannot be read is `null`, never `0`
   * (FR-RPT-001) — the caller surfaces "unavailable".
   */
  async opsDashboard(actor: Actor, locationCode?: string) {
    const orgId = await this.orgId();
    const scope = this.effectiveScope(actor, locationCode);
    const scopeNote = this.scopeNoteFor(scope);
    // `inArray(...)`, not a raw `col = any(${scope})` fragment — the latter hands postgres.js a
    // bare JS array as a single bound parameter, which it can't serialize as a Postgres array
    // outside drizzle's own typed query builder ("malformed array literal" / "op ANY/ALL (array)
    // requires array on right side" — reproduced directly). Found live while building
    // `dashboardAnalytics()` below: this made `GET /ops/dashboard` 500 for *any* location-scoped
    // staff member — the exact audience SCREEN-OPS-002 is scoped for — with no prior test ever
    // exercising this endpoint with a non-empty scope to have caught it.
    const inPickup = scope ? inArray(rental.pickupLocationCode, scope) : sql`true`;
    const inReturn = scope ? inArray(rental.returnLocationCode, scope) : sql`true`;
    const inResPickup = scope ? inArray(reservation.pickupLocationCode, scope) : sql`true`;

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

    // fleet units carry their location as `currentLocationId` (a location FK, not a code) — join
    // to `location` to get the code the actor's scope is expressed in, same as every other
    // scoped count here.
    const fleetRows = await this.db
      .select({ state: vehicleUnit.state, n: sql<number>`count(*)::int` })
      .from(vehicleUnit)
      .innerJoin(location, eq(location.id, vehicleUnit.currentLocationId))
      .where(
        and(
          eq(vehicleUnit.organizationId, orgId),
          scope ? inArray(location.code, scope) : sql`true`,
        ),
      )
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
    // per-transaction source of truth). Reported in the org's default currency. Payments carry no
    // location column of their own, but every payment intent names the reservation it was
    // collected for — LEFT JOIN so a payment whose reservation reference is missing/stale still
    // counts in the org-wide total, but is correctly excluded once a specific location is chosen
    // (it can't be honestly attributed to one).
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
      .leftJoin(reservation, eq(reservation.reference, paymentIntent.reservationReference))
      .where(
        and(
          eq(paymentIntent.organizationId, orgId),
          eq(payment.outcome, 'succeeded'),
          sql`${payment.createdAt}::date = current_date`,
          scope ? inArray(reservation.pickupLocationCode, scope) : sql`true`,
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
      // org-wide by nature (recovery cases reference polymorphic subjects) — a branch-scoped
      // actor gets `null` ("not available for your locations"), never the organisation's numbers
      financeExceptions:
        this.scopeCodes(actor) !== null
          ? null
          : {
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
   * SCREEN-OPS-002 analytics — the trend view `opsDashboard()` deliberately doesn't have: that
   * endpoint is a today-only operational snapshot (FR-RPT-001), this one answers "is this getting
   * better or worse" over a window. Every series is generated against a real date spine
   * (`generate_series`) and LEFT JOINed, not just grouped from matching rows — a day with zero
   * bookings must show up as an honest 0, not silently vanish from the chart (the same "a report
   * that goes quiet on a bad day is worse than a report that shows a bad day" principle as the
   * rest of this service's read-time work). `days` is bounded by the controller's zod schema, not
   * here — this method trusts its caller already validated it.
   *
   * Utilization is derived retroactively from realized rental occupancy
   * (`pickedUpAt`..`returnedAt`, or still open) against the *current* fleet size — there's no
   * daily fleet-size snapshot table, so a fleet that grew/shrank over the window will read
   * slightly off for its older days. Disclosed, not hidden: `fleetTotal` is returned alongside so
   * the frontend can (and does) show that as a caveat rather than presenting it as exact.
   * `fleetTotal` itself is scoped the same as everything else here (a branch's utilization must
   * divide by *that branch's* fleet, not the org's), and the revenue series is scoped via each
   * payment's reservation (payments carry no location column of their own).
   */
  async dashboardAnalytics(actor: Actor, days: number, locationCode?: string) {
    const orgId = await this.orgId();
    const scope = this.effectiveScope(actor, locationCode);
    const scopeNote = this.scopeNoteFor(scope);
    const [org] = await this.db
      .select({ currency: organization.defaultCurrency })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);
    const currency = org?.currency ?? 'USD';

    // `IN (...)`, built via `sql.join`, not a raw `col = any(${scope})` fragment — the latter
    // hands postgres.js a bare JS array as one bound parameter, which it can't serialize as a
    // Postgres array outside drizzle's own typed query builder (reproduced directly:
    // "malformed array literal"). Same root cause just fixed in `opsDashboard()` above, here
    // in its raw-SQL-CTE form since `inArray()` only composes into a `.where()` query builder.
    const inList = (codes: string[]) =>
      sql.join(
        codes.map((c) => sql`${c}`),
        sql`, `,
      );
    // `scope`, when non-null, is always a non-empty array here — a requested location outside
    // the actor's own scope is rejected by `assertLocationAccess()` inside `effectiveScope()`
    // before this point, never silently narrowed to an empty (and SQL-invalid `IN ()`) scope.
    const resScope = scope ? sql`and r.pickup_location_code in (${inList(scope)})` : sql``;
    const rentalScope = scope ? sql`and u.pickup_location_code in (${inList(scope)})` : sql``;

    // bookings made + cancelled per day, by creation/cancellation instant — distinct from
    // `opsDashboard`'s pickups/returns, which are about *operational* activity on a given day
    const daily = await this.db.execute<{
      day: string;
      bookings: number;
      booked_minor: number;
      cancellations: number;
      revenue_minor: number;
      active_rentals: number;
    }>(sql`
      with days as (
        select generate_series((current_date - ${days - 1}::int)::date, current_date, interval '1 day')::date as day
      ),
      booked as (
        select r.created_at::date as day, count(*)::int as bookings, coalesce(sum(r.total_minor), 0)::int as booked_minor
        from reservation r
        where r.organization_id = ${orgId} and r.created_at::date >= current_date - ${days - 1}::int ${resScope}
        group by r.created_at::date
      ),
      cancelled as (
        select r.cancelled_at::date as day, count(*)::int as cancellations
        from reservation r
        where r.organization_id = ${orgId} and r.cancelled_at is not null
          and r.cancelled_at::date >= current_date - ${days - 1}::int ${resScope}
        group by r.cancelled_at::date
      ),
      captured as (
        -- payments carry no location column of their own; LEFT JOIN to the reservation each
        -- intent names so a specific-location filter can attribute revenue correctly. A payment
        -- whose reservation reference is missing/stale still counts in the org-wide total
        -- (LEFT, not INNER) but is honestly excluded once a specific location is chosen.
        select p.created_at::date as day,
          (coalesce(sum(p.amount_minor) filter (where p.type = 'capture'), 0)
            - coalesce(sum(p.amount_minor) filter (where p.type = 'refund'), 0))::int as revenue_minor
        from payment p
        inner join payment_intent pi on pi.id = p.intent_id
        left join reservation r on r.reference = pi.reservation_reference
        where pi.organization_id = ${orgId} and p.outcome = 'succeeded'
          and p.created_at::date >= current_date - ${days - 1}::int
          ${resScope}
        group by p.created_at::date
      ),
      occupied as (
        select d.day, count(u.id)::int as active_rentals
        from days d
        left join rental u on u.organization_id = ${orgId}
          and u.picked_up_at is not null
          and u.picked_up_at::date <= d.day
          and (u.returned_at is null or u.returned_at::date >= d.day)
          ${rentalScope}
        group by d.day
      )
      select
        d.day::text as day,
        coalesce(b.bookings, 0) as bookings,
        coalesce(b.booked_minor, 0) as booked_minor,
        coalesce(c.cancellations, 0) as cancellations,
        coalesce(cap.revenue_minor, 0) as revenue_minor,
        coalesce(o.active_rentals, 0) as active_rentals
      from days d
      left join booked b on b.day = d.day
      left join cancelled c on c.day = d.day
      left join captured cap on cap.day = d.day
      left join occupied o on o.day = d.day
      order by d.day
    `);

    // same location join as `opsDashboard()` — a branch's utilization % must divide by *that
    // branch's* fleet, not the whole org's, or narrowing to one location would make every
    // branch's utilization read artificially tiny against the org-wide total.
    const fleetRows = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(vehicleUnit)
      .innerJoin(location, eq(location.id, vehicleUnit.currentLocationId))
      .where(
        and(
          eq(vehicleUnit.organizationId, orgId),
          scope ? inArray(location.code, scope) : sql`true`,
        ),
      );
    const fleetTotal = fleetRows[0]?.n ?? 0;

    const byCategory = await this.db.execute<{
      category_code: string;
      reservations: number;
      revenue_minor: number;
    }>(sql`
      select r.category_code, count(*)::int as reservations, coalesce(sum(r.total_minor), 0)::int as revenue_minor
      from reservation r
      where r.organization_id = ${orgId}
        and r.state in ('confirmed', 'fulfilled')
        and r.created_at::date >= current_date - ${days - 1}::int
        ${resScope}
      group by r.category_code
      order by revenue_minor desc
    `);

    return {
      scopeNote,
      rangeDays: days,
      currency,
      fleetTotal,
      daily: daily.map((r) => ({
        date: r.day,
        bookings: Number(r.bookings),
        bookedMinor: Number(r.booked_minor),
        cancellations: Number(r.cancellations),
        revenueMinor: Number(r.revenue_minor),
        utilizationPct: utilizationPercent(Number(r.active_rentals), fleetTotal),
      })),
      byCategory: byCategory.map((r) => ({
        categoryCode: r.category_code,
        reservations: Number(r.reservations),
        revenueMinor: Number(r.revenue_minor),
      })),
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
    return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join(
      '\n',
    );
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

    // Claim before doing any real work: an atomic compare-and-swap on `lastRunAt` (a single
    // `UPDATE … WHERE … RETURNING` is inherently race-free under Postgres's row-level locking —
    // no advisory lock or shared transaction across `run()`/`notify.send()` needed). Closes the
    // gap between the automatic dispatcher tick and a manual "Send now" (or two overlapping
    // ticks, if a slow run ever outlasts the 60s repeat interval) landing on the same schedule at
    // once — without this, both could pass the checks above and double-send. 10s is far wider
    // than any realistic race window but short enough not to block a deliberate quick re-send.
    const [claimed] = await this.db
      .update(reportSchedule)
      .set({ lastRunAt: sql`now()` })
      .where(
        and(
          eq(reportSchedule.id, id),
          sql`(${reportSchedule.lastRunAt} is null or ${reportSchedule.lastRunAt} < now() - interval '10 seconds')`,
        ),
      )
      .returning({ id: reportSchedule.id });
    if (!claimed) {
      throw new AppError('state_conflict', {
        title: 'This schedule was just dispatched by another request — try again shortly',
        params: { reason: 'already_in_flight' },
      });
    }

    // Resume, don't restart: a prior attempt that failed partway through already generated the
    // report and already sent to some recipients — reuse that same run and narrow to only the
    // recipients still outstanding, instead of calling `run()` again (a fresh runId) and resending
    // to everyone, including the ones who already got a copy.
    const resuming = !!sch.pendingRunId && !!sch.pendingRecipients?.length;
    const outstandingRecipients = resuming ? sch.pendingRecipients! : sch.recipients;

    try {
      const run = resuming
        ? { runId: sch.pendingRunId!, title: sch.definitionCode, rowCount: 0, scopeNote: '' }
        : await this.run(owner, sch.definitionCode, sch.params);
      // A fresh run's report_run row carries the real title/rowCount/scopeNote for the message
      // body; a resumed one re-derives that same info without generating the report a second
      // time (the row already exists from the failed attempt).
      const runInfo = resuming ? await this.reportRunInfo(run.runId) : run;

      // Isolate each recipient: one bad address/notify failure must not stop delivery to the
      // rest, and must not make the rest look "failed" and get resent next tick.
      const failed: string[] = [];
      for (const recipient of outstandingRecipients) {
        try {
          await this.notify.send({
            event: 'admin.report.delivered',
            recipient,
            fallback: {
              subject: `${runInfo.title} — report`,
              body:
                `Your scheduled report "${runInfo.title}" ran with ${runInfo.rowCount} row(s). ` +
                `Scope: ${runInfo.scopeNote}. Sign in to the operations console → Insights to view ` +
                `or export the full data.`,
            },
            sourceType: 'report_run',
            sourceId: run.runId,
          });
        } catch (err) {
          this.logger.warn(
            { scheduleId: id, runId: run.runId, err: err instanceof Error ? err.message : err },
            'report delivery to one recipient failed — isolated, others continue',
          );
          failed.push(recipient);
        }
      }

      if (failed.length > 0) {
        // Pin the outstanding set for the next retry and put `lastRunAt` back so it isn't stuck
        // waiting out a full cron cycle — the recipients who already succeeded are excluded next
        // time because `outstandingRecipients` (not `sch.recipients`) drives the loop above.
        await this.db
          .update(reportSchedule)
          .set({
            lastRunAt: sch.lastRunAt,
            pendingRunId: run.runId,
            pendingRecipients: failed,
            lastSkipReason: 'partial_delivery_failure',
            updatedAt: sql`now()`,
          })
          .where(eq(reportSchedule.id, id));
        await this.audit.record({
          action: 'report.schedule.partial_failure',
          targetType: 'report_schedule',
          targetId: id,
          actor,
          after: {
            runId: run.runId,
            failed: failed.length,
            sent: outstandingRecipients.length - failed.length,
          },
        });
        throw new AppError('business_rule_violation', {
          title: `Report delivered to ${outstandingRecipients.length - failed.length}/${outstandingRecipients.length} recipient(s); the rest will retry`,
          params: { reason: 'partial_delivery_failure', failedCount: failed.length },
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
          rowCount: runInfo.rowCount,
        },
      });
      await this.db
        .update(reportSchedule)
        .set({
          lastSkipReason: null,
          pendingRunId: null,
          pendingRecipients: null,
          updatedAt: sql`now()`,
        })
        .where(eq(reportSchedule.id, id));
      await this.audit.record({
        action: 'report.schedule.sent',
        targetType: 'report_schedule',
        targetId: id,
        actor,
        after: { runId: run.runId, recipients: sch.recipients.length },
      });
      return { sent: true as const, runId: run.runId, recipients: sch.recipients };
    } catch (err) {
      // A partial-failure retry state was already persisted (with its own `lastRunAt` reset)
      // above — don't clobber `pendingRunId`/`pendingRecipients` by also running the generic
      // reset below for that same error.
      if (err instanceof AppError && err.params?.reason === 'partial_delivery_failure') throw err;
      // the claim must not cost a legitimate retry: if generating the report itself failed before
      // any recipient was attempted, put `lastRunAt` back so the very next tick (or another manual
      // click) can try again immediately instead of waiting out a cron cycle.
      await this.db
        .update(reportSchedule)
        .set({ lastRunAt: sch.lastRunAt })
        .where(eq(reportSchedule.id, id));
      throw err;
    }
  }

  /** Re-derives the message fields a resumed delivery needs from the already-generated run row,
   *  without generating the report again. */
  private async reportRunInfo(
    runId: string,
  ): Promise<{ title: string; rowCount: number; scopeNote: string }> {
    const [row] = await this.db
      .select({
        definitionCode: reportRun.definitionCode,
        rowCount: reportRun.rowCount,
        scopeNote: reportRun.scopeNote,
      })
      .from(reportRun)
      .where(eq(reportRun.id, runId))
      .limit(1);
    if (!row) throw AppError.notFound('report run');
    const [def] = await this.db
      .select({ title: reportDefinition.title })
      .from(reportDefinition)
      .where(eq(reportDefinition.code, row.definitionCode))
      .limit(1);
    return {
      title: def?.title ?? row.definitionCode,
      rowCount: row.rowCount,
      scopeNote: row.scopeNote ?? '',
    };
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
    const eff = await this.access.resolveForProfile(profile.id);
    const permissions = eff.permissions;
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
      roleCodes: eff.roleCodes,
      locationScope: profile.locationScope,
      permissionConditions: eff.conditions,
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
  async dispatchDueSchedules(now: Date): Promise<{
    checked: number;
    dispatched: string[];
    failed: Array<{ id: string; error: string }>;
  }> {
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
    const failed: Array<{ id: string; error: string }> = [];
    for (const sch of active) {
      const baseline = sch.lastRunAt ?? sch.createdAt;
      if (!isScheduleDue(sch.cron, baseline, now)) continue;
      try {
        // a null actor records this audit trail as system-triggered (AuditService already has a
        // 'system' actorType fallback for exactly this) — there is no human to attribute it to.
        await this.sendScheduleNow(null, sch.id);
        dispatched.push(sch.id);
      } catch (err) {
        // isolated per schedule — one bad/failing row (or a benign `already_in_flight` conflict
        // from an overlapping tick) must never stop every *other* due schedule in this same
        // batch from being dispatched. The next tick retries automatically.
        failed.push({ id: sch.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { checked: active.length, dispatched, failed };
  }

  // ---- audit viewer (SCREEN-OPS-038) ----
  // Lives here (not a dedicated audit module) because the whole `ops/audit` + `ops/data-quality`
  // surface was already bundled into this controller — see its own top-of-file note. Not
  // relocating that as part of this pass; flagged, not silently left as-is.

  /**
   * FR-ADM-009 — real pagination (`total` + `limit`/`offset`), not the previous hardcoded
   * newest-200-no-further behaviour: an org whose audit trail has grown past 200 matching rows
   * for a filter could never see anything older, with no indication that was even happening. Also
   * adds `targetId`/`actorId`/`outcome`/`surface` filters — the underlying table already carries
   * (and indexes) all of them; only `action`/`targetType`/`from`/`to` were ever wired up. `targetId`
   * in particular is what makes a "view history" link from another screen possible (see
   * staff-roles-page.tsx's use of it) — a raw id isn't something an admin would type by hand, but
   * every detail screen in the app already has the id of the record it's showing.
   */
  /**
   * Keyset (cursor) pagination, not offset — deliberately, not just "the modern way": an
   * `OFFSET N` page still costs the database an O(N) walk-and-discard of every row before it,
   * so a deep page against a large, loosely-filtered append-only log gets slower the further in
   * you go. A keyset cursor ("give me everything strictly after this exact row") costs the same
   * as page one, at any depth, because it's answered by the `(action, occurred_at)` /
   * `(target_type, target_id)` / `(actor_type, actor_id)` indexes directly rather than a scan.
   * `total` is still a plain COUNT (over the filter, never the cursor) — page 1 onward all share
   * the same honest total; only the row-fetch itself is keyset-based.
   *
   * `(occurred_at, seq)` — not `occurred_at` alone — is the cursor: `occurred_at` isn't unique
   * (several events can share a timestamp), so an `occurred_at`-only cursor could skip or repeat
   * rows across a page boundary. `seq` (the table's own bigserial PK, strictly insertion-ordered)
   * makes the pair unique and gives Postgres's native row-comparison (`(a, b) < (x, y)`) an exact,
   * stable ordering to resume from.
   */
  async auditLog(query: {
    action?: string;
    targetType?: string;
    targetId?: string;
    actorId?: string;
    outcome?: 'accepted' | 'rejected' | 'failed';
    surface?: string;
    from?: string;
    to?: string;
    limit: number;
    cursor?: string;
  }) {
    const filters = [];
    if (query.action) filters.push(eq(auditEvent.action, query.action));
    if (query.targetType) filters.push(eq(auditEvent.targetType, query.targetType));
    if (query.targetId) filters.push(eq(auditEvent.targetId, query.targetId));
    if (query.actorId) filters.push(eq(auditEvent.actorId, query.actorId));
    if (query.outcome) filters.push(eq(auditEvent.outcome, query.outcome));
    if (query.surface) filters.push(eq(auditEvent.surface, query.surface));
    if (query.from) filters.push(gte(auditEvent.occurredAt, query.from));
    if (query.to) filters.push(lte(auditEvent.occurredAt, query.to));
    const where = filters.length ? and(...filters) : sql`true`;

    const [countRow] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditEvent)
      .where(where);

    const cursor = query.cursor ? decodeAuditCursor(query.cursor) : null;
    const pageWhere = cursor
      ? and(
          where,
          sql`(${auditEvent.occurredAt}, ${auditEvent.seq}) < (${cursor.occurredAt}, ${cursor.seq})`,
        )
      : where;

    // fetch one extra row — cheaply tells us whether a next page exists without a second COUNT
    const rows = await this.db
      .select({
        id: auditEvent.id,
        seq: auditEvent.seq,
        occurredAt: auditEvent.occurredAt,
        actor: sql<string>`coalesce(${auditEvent.actorLabel}, ${auditEvent.actorType})`,
        actorId: auditEvent.actorId,
        action: auditEvent.action,
        targetType: auditEvent.targetType,
        targetId: auditEvent.targetId,
        outcome: auditEvent.outcome,
        reason: auditEvent.reason,
        surface: auditEvent.surface,
        before: auditEvent.beforeSafe,
        after: auditEvent.afterSafe,
      })
      .from(auditEvent)
      .where(pageWhere)
      .orderBy(desc(auditEvent.occurredAt), desc(auditEvent.seq))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeAuditCursor(last.occurredAt, last.seq) : null;

    return {
      entries: page.map(({ seq: _seq, ...r }) => ({
        ...r,
        occurredAt: new Date(r.occurredAt).toISOString(),
      })),
      total: countRow?.n ?? 0,
      nextCursor,
    };
  }

  /** Typeahead for the audit log's "filter by actor" search — an actor is only ever a raw id in
   *  the trail itself (`auditEvent.actorId`), so finding "everything Alice did" otherwise meant
   *  already having a row of hers in view to click. Matches on display name or email, either
   *  staff or customer (both can be audit actors) — capped small since it's a typeahead, not a
   *  report. */
  async searchActors(
    q: string,
  ): Promise<Array<{ id: string; label: string; email: string; kind: string }>> {
    const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const rows = await this.db
      .select({
        id: account.id,
        displayName: account.displayName,
        email: account.email,
        kind: account.kind,
      })
      .from(account)
      .where(or(ilike(account.displayName, like), ilike(account.email, like)))
      .orderBy(asc(account.displayName))
      .limit(10);
    return rows.map((r) => ({ id: r.id, label: r.displayName, email: r.email, kind: r.kind }));
  }

  /**
   * FR-ADM-013 (SCREEN-OPS-039) — a read-only sweep of referential-integrity / drift checks.
   * Each check is a cheap COUNT plus a short sample of offending keys; a non-zero count is
   * something ops should work, never a hard failure. Add a check = one more entry in `CHECKS`.
   *
   * Several of these columns (`rental.unitId`, `vehicleUnit.currentLocationId`,
   * `lookupValue.typeCode`, `reservation.accountId`) have no DB-level foreign key — this sweep is
   * the only thing that would ever notice one of them drift, whether from an app bug, a manual
   * fix, or a data import. Each check runs in isolation (see `runDataQualityCheck`): one bad
   * query must never take down the other five results behind a single 500.
   */
  async dataQuality(): Promise<{
    checkedAt: string;
    ok: boolean;
    checks: DataQualityCheckWithFinding[];
  }> {
    const CHECKS: DataQualityCheckDef[] = [
      {
        id: 'rental_active_without_unit',
        title: 'Active or overdue rentals with no vehicle assigned',
        severity: 'high',
        countSql: sql`select count(*)::int as n from rental where state in ('active','overdue') and unit_id is null`,
        sampleSql: sql`select reference as key from rental where state in ('active','overdue') and unit_id is null limit 8`,
      },
      {
        id: 'unit_orphan_location',
        title: 'Vehicle units pointing at a location that no longer exists',
        severity: 'high',
        countSql: sql`select count(*)::int as n from vehicle_unit u where not exists (select 1 from location l where l.id = u.current_location_id)`,
        sampleSql: sql`select plate as key from vehicle_unit u where not exists (select 1 from location l where l.id = u.current_location_id) limit 8`,
      },
      {
        id: 'lookup_value_dangling_type',
        title: 'Lookup values whose type is missing',
        severity: 'medium',
        countSql: sql`select count(*)::int as n from lookup_value v where not exists (select 1 from lookup_type t where t.code = v.type_code)`,
        sampleSql: sql`select (v.type_code || ':' || v.code) as key from lookup_value v where not exists (select 1 from lookup_type t where t.code = v.type_code) limit 8`,
      },
      {
        id: 'reservation_orphan_account',
        title: 'Reservations linked to an account that no longer exists',
        severity: 'medium',
        countSql: sql`select count(*)::int as n from reservation r where r.account_id is not null and not exists (select 1 from account a where a.id = r.account_id)`,
        sampleSql: sql`select r.reference as key from reservation r where r.account_id is not null and not exists (select 1 from account a where a.id = r.account_id) limit 8`,
      },
      {
        id: 'payment_intent_orphan_reservation',
        title: 'Payment intents referencing a reservation that no longer exists',
        severity: 'medium',
        countSql: sql`select count(*)::int as n from payment_intent pi where not exists (select 1 from reservation r where r.reference = pi.reservation_reference)`,
        sampleSql: sql`select pi.reservation_reference as key from payment_intent pi where not exists (select 1 from reservation r where r.reference = pi.reservation_reference) limit 8`,
      },
      {
        id: 'config_never_published',
        title: 'Config settings that have revisions but nothing published',
        severity: 'low',
        countSql: sql`select count(*)::int as n from (select kind, key from config_version group by kind, key having bool_and(state <> 'published') and bool_or(state <> 'draft')) q`,
        sampleSql: sql`select (kind || ':' || key) as key from config_version group by kind, key having bool_and(state <> 'published') and bool_or(state <> 'draft') limit 8`,
      },
      {
        id: 'recovery_case_stale',
        title: 'Recovery cases open longer than 14 days',
        severity: 'medium',
        countSql: sql`select count(*)::int as n from recovery_case where state <> 'resolved' and created_at < now() - interval '14 days'`,
        sampleSql: sql`select (kind || ' · ' || subject_ref) as key from recovery_case where state <> 'resolved' and created_at < now() - interval '14 days' limit 8`,
      },
    ];

    const checks = await Promise.all(
      CHECKS.map((c) =>
        // only the display fields go to `runDataQualityCheck` as `meta` — passing `c` itself
        // would spread its raw `countSql`/`sampleSql` Drizzle query-builder objects into the
        // response alongside `count`/`ok`/`sample`/`error`
        runDataQualityCheck({ id: c.id, title: c.title, severity: c.severity }, async () => {
          const countRows = await this.db.execute<{ n: number }>(c.countSql);
          const count = Number(countRows[0]?.n ?? 0);
          const sample =
            count > 0
              ? (await this.db.execute<{ key: string }>(c.sampleSql)).map((r) => r.key)
              : [];
          return { count, sample };
        }),
      ),
    );

    const orgId = await this.orgId();
    const findingInfo = await this.reconcileFindings(orgId, checks);
    const withFindings: DataQualityCheckWithFinding[] = checks.map((c) => {
      const info = findingInfo.get(c.id);
      return {
        ...c,
        findingState: info?.findingState ?? 'clear',
        ownerId: info?.ownerId ?? null,
        firstSeenAt: info?.firstSeenAt ?? null,
        lastSeenAt: info?.lastSeenAt ?? null,
        resolvedAt: info?.resolvedAt ?? null,
        resolutionNote: info?.resolutionNote ?? null,
      };
    });

    return {
      checkedAt: new Date().toISOString(),
      // a check that couldn't even run is not "clear" — don't let a query failure masquerade as
      // a clean bill of health
      ok: withFindings.every((c) => c.ok && !c.error),
      checks: withFindings,
    };
  }

  /**
   * Upserts each check's tracked finding against its live result (FR-RPT-006's "owner, status,
   * first/last seen, resolution evidence" — one finding row per check id, the granularity the
   * checks themselves already work at). A finding already resolved/false_positive for the *exact
   * same* violating set (same `sampleHash`) stays closed — re-surfacing an identical, already-
   * dispositioned result every run would be exactly the alert fatigue this feature exists to
   * prevent. A *different* set under the same check id (a materially different occurrence, per
   * FR-RPT-006's acceptance evidence) reopens it. The underlying data getting fixed (count back to
   * 0) auto-resolves an open/acknowledged finding — nobody should have to manually close something
   * the system already knows is gone.
   *
   * Never allowed to block the actual check results from reaching the caller: a write failure
   * here is logged and swallowed, not thrown — this is bookkeeping on the read path, not the
   * reason for it.
   */
  private async reconcileFindings(
    orgId: string,
    checks: DataQualityCheckResult[],
  ): Promise<Map<string, DataQualityFindingInfo>> {
    const info = new Map<string, DataQualityFindingInfo>();
    for (const c of checks) {
      if (c.error) continue; // a check that couldn't even run leaves its finding state untouched
      try {
        const now = new Date().toISOString();
        const [existing] = await this.db
          .select()
          .from(dataQualityFinding)
          .where(
            and(eq(dataQualityFinding.organizationId, orgId), eq(dataQualityFinding.checkId, c.id)),
          )
          .limit(1);
        const hash = sampleHash(c.sample);

        if (c.count > 0) {
          if (!existing) {
            const [row] = await this.db
              .insert(dataQualityFinding)
              .values({
                organizationId: orgId,
                checkId: c.id,
                title: c.title,
                severity: c.severity,
                state: 'open',
                count: c.count,
                sampleHash: hash,
                firstSeenAt: now,
                lastSeenAt: now,
              })
              .returning();
            info.set(c.id, toFindingInfo(row!));
          } else if (existing.state === 'resolved' || existing.state === 'false_positive') {
            const [row] =
              existing.sampleHash === hash
                ? // same violation, already dispositioned — stays closed, just confirm still seen
                  await this.db
                    .update(dataQualityFinding)
                    .set({ count: c.count, lastSeenAt: now, updatedAt: sql`now()` })
                    .where(eq(dataQualityFinding.id, existing.id))
                    .returning()
                : // materially different occurrence — reopens
                  await this.db
                    .update(dataQualityFinding)
                    .set({
                      state: 'open',
                      count: c.count,
                      sampleHash: hash,
                      firstSeenAt: now,
                      lastSeenAt: now,
                      ownerId: null,
                      resolvedAt: null,
                      resolvedBy: null,
                      resolutionNote: null,
                      updatedAt: sql`now()`,
                    })
                    .where(eq(dataQualityFinding.id, existing.id))
                    .returning();
            info.set(c.id, toFindingInfo(row!));
          } else {
            // open or acknowledged — keep the state, refresh the live numbers
            const [row] = await this.db
              .update(dataQualityFinding)
              .set({ count: c.count, sampleHash: hash, lastSeenAt: now, updatedAt: sql`now()` })
              .where(eq(dataQualityFinding.id, existing.id))
              .returning();
            info.set(c.id, toFindingInfo(row!));
          }
        } else if (existing && (existing.state === 'open' || existing.state === 'acknowledged')) {
          const [row] = await this.db
            .update(dataQualityFinding)
            .set({
              state: 'resolved',
              count: 0,
              resolvedAt: now,
              resolvedBy: null,
              resolutionNote: '(auto-resolved — the underlying data was fixed)',
              updatedAt: sql`now()`,
            })
            .where(eq(dataQualityFinding.id, existing.id))
            .returning();
          info.set(c.id, toFindingInfo(row!));
        } else if (existing) {
          info.set(c.id, toFindingInfo(existing));
        }
        // else: count is 0 and no finding row ever existed — nothing to track, stays "clear"
      } catch (e) {
        this.logger.warn(
          `data-quality finding reconciliation failed for ${c.id}: ${(e as Error).message}`,
        );
      }
    }
    return info;
  }

  private async loadFinding(orgId: string, checkId: string) {
    const [row] = await this.db
      .select()
      .from(dataQualityFinding)
      .where(
        and(eq(dataQualityFinding.organizationId, orgId), eq(dataQualityFinding.checkId, checkId)),
      )
      .limit(1);
    if (!row) throw AppError.notFound('data-quality finding');
    return row;
  }

  /** Claims a finding — the current actor becomes its owner. Matches this app's own "claim it"
   *  ergonomics elsewhere (e.g. picking up a recovery case) rather than a separate assignee
   *  picker; reassigning to someone else isn't built yet — a disclosed, deliberate scope
   *  boundary, not an oversight. */
  async acknowledgeFinding(actor: Actor, checkId: string): Promise<void> {
    const orgId = await this.orgId();
    const row = await this.loadFinding(orgId, checkId);
    if (row.state !== 'open' && row.state !== 'acknowledged') {
      throw AppError.businessRule(`A ${row.state} finding cannot be acknowledged`, {
        reason: row.state,
      });
    }
    await this.db
      .update(dataQualityFinding)
      .set({ state: 'acknowledged', ownerId: actor.accountId, updatedAt: sql`now()` })
      .where(eq(dataQualityFinding.id, row.id));
    await this.audit.record({
      action: 'data_quality.finding.acknowledged',
      targetType: 'data_quality_finding',
      targetId: checkId,
      actor,
    });
  }

  async resolveFinding(actor: Actor, checkId: string, note: string): Promise<void> {
    return this.closeFinding(actor, checkId, 'resolved', note);
  }

  async markFindingFalsePositive(actor: Actor, checkId: string, note: string): Promise<void> {
    return this.closeFinding(actor, checkId, 'false_positive', note);
  }

  /** Requires a reason either way (matches `reject()`/recovery-case `resolve()` elsewhere in this
   *  app) — "clear" and "false positive" are both consequential calls on a compliance-adjacent
   *  signal and deserve the same accountability a rejection reason gets. */
  private async closeFinding(
    actor: Actor,
    checkId: string,
    state: 'resolved' | 'false_positive',
    note: string,
  ): Promise<void> {
    const orgId = await this.orgId();
    const row = await this.loadFinding(orgId, checkId);
    if (row.state === 'resolved' || row.state === 'false_positive') {
      throw AppError.businessRule(`This finding is already ${row.state}`, { reason: row.state });
    }
    await this.db
      .update(dataQualityFinding)
      .set({
        state,
        resolvedAt: sql`now()`,
        resolvedBy: actor.accountId,
        resolutionNote: note,
        updatedAt: sql`now()`,
      })
      .where(eq(dataQualityFinding.id, row.id));
    await this.audit.record({
      action:
        state === 'resolved'
          ? 'data_quality.finding.resolved'
          : 'data_quality.finding.false_positive',
      targetType: 'data_quality_finding',
      targetId: checkId,
      actor,
      reason: note,
    });
  }
}

export interface DataQualityFindingInfo {
  findingState: 'clear' | 'open' | 'acknowledged' | 'resolved' | 'false_positive';
  ownerId: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export type DataQualityCheckWithFinding = DataQualityCheckResult & DataQualityFindingInfo;

function toFindingInfo(row: typeof dataQualityFinding.$inferSelect): DataQualityFindingInfo {
  return {
    findingState: row.state as DataQualityFindingInfo['findingState'],
    ownerId: row.ownerId,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    resolvedAt: row.resolvedAt,
    resolutionNote: row.resolutionNote,
  };
}

/** Hash of the sorted sample set — how a resolved/false_positive finding tells "the exact same
 *  violation, still not fixed" (stays suppressed) from "a different one just showed up under the
 *  same check id" (reopens). Exported standalone (no DB) for direct unit coverage: this is the
 *  one piece of the reconciliation state machine that would silently either spam ops with
 *  re-alerts on an already-handled issue, or hide a genuinely new one, if it were ever wrong. */
export function sampleHash(sample: string[]): string {
  return createHash('sha256')
    .update(JSON.stringify([...sample].sort()))
    .digest('hex');
}

export interface DataQualityCheckDef {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  countSql: ReturnType<typeof sql>;
  sampleSql: ReturnType<typeof sql>;
}

export interface DataQualityCheckResult {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  count: number;
  ok: boolean;
  sample: string[];
  /** null unless the check's own query failed — a distinct state from "count is 0", surfaced to
   *  the UI so a failed check is never silently reported as clear. */
  error: string | null;
}

/**
 * Runs one data-quality check's (count, sample) pair, isolating its failure so one broken check
 * (a table mid-migration, a lock, a typo in a future check someone adds) never takes the other
 * five results down with it behind a single 500 — the same isolation principle as the report
 * schedule dispatcher (`dispatchDueSchedules`) not letting one bad schedule starve the rest of a
 * tick. Exported standalone (no DB — `run` is injected) for direct unit coverage of the isolation
 * guarantee itself, without needing a real query to fail.
 */
export async function runDataQualityCheck(
  meta: { id: string; title: string; severity: 'high' | 'medium' | 'low' },
  run: () => Promise<{ count: number; sample: string[] }>,
): Promise<DataQualityCheckResult> {
  try {
    const { count, sample } = await run();
    return { ...meta, count, ok: count === 0, sample, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'check failed';
    return {
      ...meta,
      count: 0,
      ok: false,
      sample: [],
      // ops-authenticated audience, and this is diagnostic-by-design — but still capped, never a
      // full stack trace, in case a future check's error ever got unexpectedly verbose
      error: message.slice(0, 300),
    };
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

// encodeAuditCursor/decodeAuditCursor moved to common/audit/audit-cursor.ts — shared with
// consent.service.ts, which pages the same `audit_event` table the same way.

/** `dashboardAnalytics()`'s one bit of real arithmetic — everything else in that method is SQL.
 *  `null`, not `0`, when the org has no fleet at all: a 0% utilization line reads as "we have
 *  cars and none of them are rented," a very different (and false) claim than "we have no cars to
 *  measure." Capped at 100 — the occupancy count and the fleet-size denominator are read at
 *  slightly different moments (a unit transferred/retired between the two queries, say), so a
 *  brief >100% is possible upstream; showing it verbatim would be a visibly nonsensical number for
 *  what's supposed to be a percentage. Exported standalone for direct unit coverage of both. */
export function utilizationPercent(activeRentals: number, fleetTotal: number): number | null {
  return fleetTotal > 0 ? Math.min(100, Math.round((activeRentals / fleetTotal) * 100)) : null;
}

/** One CSV cell, safe to open directly in Excel/Sheets. Two concerns, applied in order:
 *  (1) CSV/formula injection (OWASP) — a cell whose value opens with =, +, -, or @ runs as a
 *  live formula the instant the file is opened; a leading apostrophe forces "treat as text" in
 *  both Excel and Sheets, and is otherwise invisible to the reader. (2) standard CSV quoting for
 *  a value containing a comma, quote, or newline — applied after (1), so an injection prefix
 *  that itself begins with a quote is still wrapped correctly. */
export function csvCell(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
