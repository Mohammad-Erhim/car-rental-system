import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
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
 * and a `href` to the permitted next surface. Saved views are a documented follow-up.
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

@Injectable()
export class SearchService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async search(
    actor: Actor,
    params: SearchParams,
  ): Promise<{ query: string; count: number; results: SearchHit[] }> {
    const canReservations = actor.permissions.includes('reservation.read');
    const canRentals = actor.permissions.includes('rental.read');
    if (!canReservations && !canRentals) {
      throw AppError.forbidden('You cannot search reservations or rentals');
    }

    const q = (params.q ?? '').trim();
    if (q && q.length < 2) {
      throw AppError.validation([{ path: 'q', code: 'too_small', params: { min: 2 } }]);
    }
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
    const from = this.parseDate(params.from, 'from');
    const to = this.parseDate(params.to, 'to');

    const wantReservations = canReservations && params.kind !== 'rental';
    const wantRentals = canRentals && params.kind !== 'reservation';

    const results: SearchHit[] = [];
    if (wantReservations)
      results.push(...(await this.reservations(q, like, params, from, to, limit)));
    if (wantRentals) results.push(...(await this.rentals(q, like, params, from, to, limit)));

    results.sort((a, b) => (a.pickupAt < b.pickupAt ? 1 : a.pickupAt > b.pickupAt ? -1 : 0));
    return { query: q, count: results.length, results: results.slice(0, limit) };
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
    limit: number,
  ): Promise<SearchHit[]> {
    const where: SQL[] = [];
    if (params.status) where.push(eq(reservation.state, params.status));
    if (params.locationCode) where.push(eq(reservation.pickupLocationCode, params.locationCode));
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
      .leftJoin(
        reservationDriver,
        and(
          eq(reservationDriver.reservationId, reservation.id),
          eq(reservationDriver.role, 'primary_renter'),
        ),
      )
      .where(where.length ? and(...where) : sql`true`)
      .orderBy(desc(reservation.pickupAt))
      .limit(limit);

    return rows.map((r) => ({
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
  }

  private async rentals(
    q: string,
    like: string,
    params: SearchParams,
    from: Date | null,
    to: Date | null,
    limit: number,
  ): Promise<SearchHit[]> {
    const where: SQL[] = [];
    if (params.status) where.push(eq(rental.state, params.status));
    if (params.locationCode) where.push(eq(rental.pickupLocationCode, params.locationCode));
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
      .leftJoin(
        reservationDriver,
        and(
          eq(reservationDriver.reservationId, reservation.id),
          eq(reservationDriver.role, 'primary_renter'),
        ),
      )
      .leftJoin(vehicleUnit, eq(vehicleUnit.id, rental.unitId))
      .where(where.length ? and(...where) : sql`true`)
      .orderBy(desc(rental.scheduledPickupAt))
      .limit(limit);

    const now = Date.now();
    return rows.map((r) => ({
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
  }
}
