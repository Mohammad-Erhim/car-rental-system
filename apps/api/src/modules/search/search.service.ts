import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import { effectiveLocationCodes } from '../../common/auth/location-scope';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { vehicleUnit } from '../../database/schema/fleet';
import { rental } from '../../database/schema/rental';
import { reservation, reservationDriver } from '../../database/schema/reservation';

/**
 * FR-ADM-003 / SCREEN-OPS-004 — one search across reservations *and* rentals. Free text matches a
 * reference, the primary driver, or (for rentals) the vehicle plate/VIN; the caller narrows with
 * status / location / a pickup-date window. Results carry a `kind` so the two are distinguished
 * and a `href` to the permitted next surface.
 *
 * Access: a location-scoped actor only sees rows for their own pickup locations (FR-RPT-004),
 * the same boundary the reports apply. Every query is recorded to the audit trail — a driver /
 * licence lookup is a PII access (SRS-SEC-016).
 *
 * Results are paginated (`page` / `pageSize`, newest pickup first, `reference` as the tie-break so
 * page boundaries are stable). The two sides are merged in memory, so each page reads the top
 * `page × pageSize` rows of each table; the window is capped at {@link MAX_WINDOW} — past that the
 * operator is meant to narrow the search, not page deeper.
 */
export interface SearchParams {
  q?: string;
  kind?: 'reservation' | 'rental';
  status?: string;
  locationCode?: string;
  from?: string; // ISO date/datetime — pickup window start
  to?: string; // pickup window end
  page?: number; // 1-based, default 1
  pageSize?: number; // default 25, max 100
}

export interface SearchHit {
  kind: 'reservation' | 'rental';
  reference: string;
  reservationReference: string | null;
  status: string;
  overdue: boolean;
  driverName: string | null;
  locationCode: string;
  returnLocationCode: string;
  pickupAt: string;
  returnAt: string;
  categoryCode: string | null;
  plate: string | null;
  currency: string | null;
  totalMinor: number | null;
  paidMinor: number | null;
  href: string;
}

export interface SearchResponse {
  query: string;
  page: number;
  pageSize: number;
  /** rows on this page (<= pageSize) */
  count: number;
  /** true number of matches for the current filters (both kinds unless `kind` is set) */
  total: number;
  pageCount: number;
  /** matches per kind under the current filters *ignoring* `kind` — drives the kind tabs */
  kindCounts: { reservation: number; rental: number };
  results: SearchHit[];
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
/** Deepest row (page × pageSize) a caller can reach — beyond it, narrow the search instead. */
const MAX_WINDOW = 1000;

@Injectable()
export class SearchService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  private scopeCodes(actor: Actor): string[] | null {
    return actor.locationScope?.length ? actor.locationScope : null;
  }

  async search(actor: Actor, params: SearchParams): Promise<SearchResponse> {
    const canReservations = actor.permissions.includes('reservation.read');
    const canRentals = actor.permissions.includes('rental.read');
    if (!canReservations && !canRentals) {
      throw AppError.forbidden('You cannot search reservations or rentals');
    }

    const q = (params.q ?? '').trim();
    if (q && q.length < 2) {
      throw AppError.validation([{ path: 'q', code: 'too_small', params: { min: 2 } }]);
    }
    const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const { page, pageSize } = this.parsePaging(params);
    const window = page * pageSize;
    const from = this.parseDate(params.from, 'from');
    const to = this.parseDate(params.to, 'to');
    // `locationCode` may be a comma-separated list (top-bar filter); a code outside the actor's own
    // scope is a 403, not a silently-empty result (SRS-SEC-007). A booking belongs to both its
    // pickup and its return branch.
    const scope = effectiveLocationCodes(actor, params.locationCode);
    const actorScoped = this.scopeCodes(actor) !== null;

    const wantReservations = canReservations && params.kind !== 'rental';
    const wantRentals = canRentals && params.kind !== 'reservation';

    // counts for every permitted kind (they feed the kind tabs); rows only for the wanted ones
    const [res, ren] = await Promise.all([
      canReservations
        ? this.reservations(q, like, params, from, to, scope, wantReservations ? window : 0)
        : null,
      canRentals ? this.rentals(q, like, params, from, to, scope, wantRentals ? window : 0) : null,
    ]);
    const kindCounts = { reservation: res?.total ?? 0, rental: ren?.total ?? 0 };
    const total =
      (wantReservations ? kindCounts.reservation : 0) + (wantRentals ? kindCounts.rental : 0);

    const merged = [...(res?.hits ?? []), ...(ren?.hits ?? [])].sort(
      (a, b) =>
        (a.pickupAt < b.pickupAt ? 1 : a.pickupAt > b.pickupAt ? -1 : 0) ||
        // byte order, to match the SQL side's `COLLATE "C"` tie-break exactly
        (a.reference < b.reference ? -1 : a.reference > b.reference ? 1 : 0),
    );
    const results = merged.slice(window - pageSize, window);

    await this.audit.record({
      action: 'ops.search',
      targetType: 'search',
      actor,
      outcome: 'accepted',
      after: {
        query: q || null,
        kind: params.kind ?? null,
        status: params.status ?? null,
        locationCode: params.locationCode ?? null,
        from: params.from ?? null,
        to: params.to ?? null,
        page,
        total,
        locationScoped: actorScoped,
      },
    });

    return {
      query: q,
      page,
      pageSize,
      count: results.length,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      kindCounts,
      results,
    };
  }

  private parsePaging(params: SearchParams): { page: number; pageSize: number } {
    const page = params.page === undefined ? 1 : params.page;
    const pageSize = params.pageSize === undefined ? DEFAULT_PAGE_SIZE : params.pageSize;
    if (!Number.isInteger(page) || page < 1) {
      throw AppError.validation([{ path: 'page', code: 'too_small', params: { min: 1 } }]);
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw AppError.validation([{ path: 'pageSize', code: 'out_of_range' }]);
    }
    if (page * pageSize > MAX_WINDOW) {
      // too deep to page to — the operator should narrow the search instead
      throw AppError.validation([{ path: 'page', code: 'out_of_range' }]);
    }
    return { page, pageSize };
  }

  private parseDate(v: string | undefined, field: string): Date | null {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      throw AppError.validation([{ path: field, code: 'invalid_string' }]);
    }
    return d;
  }

  private async reservations(
    q: string,
    like: string,
    params: SearchParams,
    from: Date | null,
    to: Date | null,
    scope: string[] | null,
    rowLimit: number,
  ): Promise<{ hits: SearchHit[]; total: number }> {
    const where: SQL[] = [];
    if (params.status) where.push(eq(reservation.state, params.status));
    if (scope) {
      where.push(
        or(
          inArray(reservation.pickupLocationCode, scope),
          inArray(reservation.returnLocationCode, scope),
        )!,
      );
    }
    if (from) where.push(gte(reservation.pickupAt, from.toISOString()));
    if (to) where.push(lte(reservation.pickupAt, to.toISOString()));
    if (q) {
      where.push(
        or(
          ilike(reservation.reference, like),
          ilike(reservation.quoteReference, like),
          ilike(reservationDriver.fullName, like),
          ilike(reservationDriver.licenceNumber, like),
        )!,
      );
    }
    const whereSql = where.length ? and(...where) : sql`true`;
    const driverJoin = and(
      eq(reservationDriver.reservationId, reservation.id),
      eq(reservationDriver.role, 'primary_renter'),
    );

    const [countRow] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(reservation)
      .leftJoin(reservationDriver, driverJoin)
      .where(whereSql);

    if (rowLimit === 0) return { hits: [], total: countRow?.total ?? 0 };

    const rows = await this.db
      .select({
        reference: reservation.reference,
        state: reservation.state,
        categoryCode: reservation.categoryCode,
        pickupLocationCode: reservation.pickupLocationCode,
        returnLocationCode: reservation.returnLocationCode,
        pickupAt: reservation.pickupAt,
        returnAt: reservation.returnAt,
        currency: reservation.currency,
        totalMinor: reservation.totalMinor,
        paidMinor: reservation.paidMinor,
        driverName: reservationDriver.fullName,
      })
      .from(reservation)
      .leftJoin(reservationDriver, driverJoin)
      .where(whereSql)
      .orderBy(desc(reservation.pickupAt), sql`${reservation.reference} COLLATE "C"`)
      .limit(rowLimit);

    const hits = rows.map((r) => ({
      kind: 'reservation' as const,
      reference: r.reference,
      reservationReference: null,
      status: r.state,
      overdue: false,
      driverName: r.driverName,
      locationCode: r.pickupLocationCode,
      returnLocationCode: r.returnLocationCode,
      pickupAt: new Date(r.pickupAt).toISOString(),
      returnAt: new Date(r.returnAt).toISOString(),
      categoryCode: r.categoryCode,
      plate: null,
      currency: r.currency,
      totalMinor: r.totalMinor,
      paidMinor: r.paidMinor,
      href: `/work/${encodeURIComponent(r.reference)}`,
    }));
    return { hits, total: countRow?.total ?? hits.length };
  }

  private async rentals(
    q: string,
    like: string,
    params: SearchParams,
    from: Date | null,
    to: Date | null,
    scope: string[] | null,
    rowLimit: number,
  ): Promise<{ hits: SearchHit[]; total: number }> {
    const where: SQL[] = [];
    if (params.status) where.push(eq(rental.state, params.status));
    if (scope) {
      where.push(
        or(inArray(rental.pickupLocationCode, scope), inArray(rental.returnLocationCode, scope))!,
      );
    }
    if (from) where.push(gte(rental.scheduledPickupAt, from.toISOString()));
    if (to) where.push(lte(rental.scheduledPickupAt, to.toISOString()));
    if (q) {
      where.push(
        or(
          ilike(rental.reference, like),
          ilike(rental.reservationReference, like),
          ilike(reservationDriver.fullName, like),
          ilike(vehicleUnit.plate, like),
          ilike(vehicleUnit.vin, like),
        )!,
      );
    }
    const whereSql = where.length ? and(...where) : sql`true`;
    const driverJoin = and(
      eq(reservationDriver.reservationId, reservation.id),
      eq(reservationDriver.role, 'primary_renter'),
    );

    const [countRow] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(rental)
      .leftJoin(reservation, eq(reservation.reference, rental.reservationReference))
      .leftJoin(reservationDriver, driverJoin)
      .leftJoin(vehicleUnit, eq(vehicleUnit.id, rental.unitId))
      .where(whereSql);

    if (rowLimit === 0) return { hits: [], total: countRow?.total ?? 0 };

    const rows = await this.db
      .select({
        reference: rental.reference,
        reservationReference: rental.reservationReference,
        state: rental.state,
        pickupLocationCode: rental.pickupLocationCode,
        returnLocationCode: rental.returnLocationCode,
        scheduledPickupAt: rental.scheduledPickupAt,
        scheduledReturnAt: rental.scheduledReturnAt,
        returnedAt: rental.returnedAt,
        currency: rental.currency,
        settlementMinor: rental.settlementMinor,
        categoryCode: reservation.categoryCode,
        totalMinor: reservation.totalMinor,
        paidMinor: reservation.paidMinor,
        driverName: reservationDriver.fullName,
        plate: vehicleUnit.plate,
      })
      .from(rental)
      .leftJoin(reservation, eq(reservation.reference, rental.reservationReference))
      .leftJoin(reservationDriver, driverJoin)
      .leftJoin(vehicleUnit, eq(vehicleUnit.id, rental.unitId))
      .where(whereSql)
      .orderBy(desc(rental.scheduledPickupAt), sql`${rental.reference} COLLATE "C"`)
      .limit(rowLimit);

    const now = Date.now();
    const hits = rows.map((r) => ({
      kind: 'rental' as const,
      reference: r.reference,
      reservationReference: r.reservationReference,
      status: r.state,
      overdue:
        !r.returnedAt &&
        ['active', 'overdue', 'awaiting_pickup'].includes(r.state) &&
        new Date(r.scheduledReturnAt).getTime() < now,
      driverName: r.driverName,
      locationCode: r.pickupLocationCode,
      returnLocationCode: r.returnLocationCode,
      pickupAt: new Date(r.scheduledPickupAt).toISOString(),
      returnAt: new Date(r.scheduledReturnAt).toISOString(),
      categoryCode: r.categoryCode,
      plate: r.plate,
      currency: r.currency,
      totalMinor: r.totalMinor,
      paidMinor: r.paidMinor,
      href: `/rentals/${encodeURIComponent(r.reference)}`,
    }));
    return { hits, total: countRow?.total ?? hits.length };
  }
}
