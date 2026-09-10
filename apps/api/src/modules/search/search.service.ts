import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
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
 * Results are capped, not deep-paginated: entity search is a "refine, don't page" interaction —
 * the response carries the true `total` so the UI can say "showing N of M, narrow to see more".
 */
export interface SearchParams {
  q?: string;
  kind?: 'reservation' | 'rental';
  status?: string;
  locationCode?: string;
  from?: string; // ISO date/datetime — pickup window start
  to?: string; // pickup window end
  limit?: number;
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
  /** rows returned (<= limit) */
  count: number;
  /** true number of matches across both kinds, before the display cap */
  total: number;
  /** true when `total > count` — the UI prompts the operator to narrow */
  truncated: boolean;
  results: SearchHit[];
}

/** How many rows to pull from each side before merge-sorting to the display cap. */
const SCAN_PER_SIDE = 100;

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
    const rawLimit = Number(params.limit);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 100);
    const from = this.parseDate(params.from, 'from');
    const to = this.parseDate(params.to, 'to');
    const scope = this.scopeCodes(actor);

    const wantReservations = canReservations && params.kind !== 'rental';
    const wantRentals = canRentals && params.kind !== 'reservation';

    let results: SearchHit[] = [];
    let total = 0;
    if (wantReservations) {
      const r = await this.reservations(q, like, params, from, to, scope);
      results.push(...r.hits);
      total += r.total;
    }
    if (wantRentals) {
      const r = await this.rentals(q, like, params, from, to, scope);
      results.push(...r.hits);
      total += r.total;
    }

    results.sort((a, b) => (a.pickupAt < b.pickupAt ? 1 : a.pickupAt > b.pickupAt ? -1 : 0));
    results = results.slice(0, limit);

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
        total,
        locationScoped: !!scope,
      },
    });

    return { query: q, count: results.length, total, truncated: total > results.length, results };
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
  ): Promise<{ hits: SearchHit[]; total: number }> {
    const where: SQL[] = [];
    if (params.status) where.push(eq(reservation.state, params.status));
    if (params.locationCode) where.push(eq(reservation.pickupLocationCode, params.locationCode));
    if (scope) where.push(inArray(reservation.pickupLocationCode, scope));
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
      .orderBy(desc(reservation.pickupAt))
      .limit(SCAN_PER_SIDE);

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
      href: `/work?ref=${encodeURIComponent(r.reference)}`,
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
  ): Promise<{ hits: SearchHit[]; total: number }> {
    const where: SQL[] = [];
    if (params.status) where.push(eq(rental.state, params.status));
    if (params.locationCode) where.push(eq(rental.pickupLocationCode, params.locationCode));
    if (scope) where.push(inArray(rental.pickupLocationCode, scope));
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
      .orderBy(desc(rental.scheduledPickupAt))
      .limit(SCAN_PER_SIDE);

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
      href: `/rentals?ref=${encodeURIComponent(r.reference)}`,
    }));
    return { hits, total: countRow?.total ?? hits.length };
  }
}
