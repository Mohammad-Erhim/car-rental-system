import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { hold } from '../../database/schema/booking';
import { location, locationHoursException } from '../../database/schema/org';
import { reservation } from '../../database/schema/reservation';
import { CatalogueService } from '../catalogue/catalogue.service';
import { FleetService } from '../fleet/fleet.service';
import { PricingService } from '../pricing/pricing.service';

import { computeAvailability } from './availability.engine';
import { checkWithinHours, localParts } from './operating-hours';

const HOLD_TTL_MS = 15 * 60 * 1000;

export interface SearchInput {
  pickupLocationCode: string;
  returnLocationCode?: string;
  pickupAt: Date;
  returnAt: Date;
  categoryCode?: string;
}

export interface SearchOption {
  categoryCode: string;
  categoryName: string;
  class: string;
  transmission: string;
  passengers: number;
  luggage: number;
  imageRef: string | null;
  features: Array<{ code: string; label: string }>;
  bookableCount: number;
  fromTotalMinor: number | null;
  currency: string | null;
}

export interface SearchResult {
  pickupLocationCode: string;
  returnLocationCode: string;
  pickupAt: string;
  returnAt: string;
  durationHours: number;
  state: 'fresh' | 'no_results';
  options: SearchOption[];
  notices: Array<{ code: string; message: string; field?: string }>;
}

@Injectable()
export class AvailabilityService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly catalogue: CatalogueService,
    private readonly fleet: FleetService,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  private async loadLocation(code: string) {
    const [loc] = await this.db.select().from(location).where(eq(location.code, code)).limit(1);
    if (!loc) throw new AppError('resource_not_found', { title: `Location ${code} not found` });
    // a draft or archived location is never bookable — the public location list already hides it,
    // this rejects a direct search/quote/hold/booking call that names it anyway.
    if (loc.status !== 'active') {
      throw new AppError('resource_not_found', {
        title: `Location ${code} is not available for booking`,
        params: { reason: 'location_not_active' },
      });
    }
    const exceptions = await this.db
      .select()
      .from(locationHoursException)
      .where(eq(locationHoursException.locationId, loc.id));
    return { loc, exceptions };
  }

  private validateWindow(
    pickupLoc: { regularHours: unknown; timezone: string },
    returnLoc: { regularHours: unknown; timezone: string; afterHoursReturn: boolean },
    pickupExc: Array<{ date: string; closed: boolean; open: string | null; close: string | null }>,
    returnExc: Array<{ date: string; closed: boolean; open: string | null; close: string | null }>,
    pickupAt: Date,
    returnAt: Date,
  ): Array<{ code: string; message: string; field?: string }> {
    const notices: Array<{ code: string; message: string; field?: string }> = [];
    if (!(pickupAt.getTime() < returnAt.getTime())) {
      notices.push({
        code: 'invalid_window',
        message: 'Return must be after pickup.',
        field: 'returnAt',
      });
      return notices;
    }
    if (pickupAt.getTime() < Date.now() - 60_000) {
      notices.push({
        code: 'past_pickup',
        message: 'Pickup time is in the past.',
        field: 'pickupAt',
      });
    }
    const weeklyP = pickupLoc.regularHours as Parameters<typeof checkWithinHours>[1];
    const weeklyR = returnLoc.regularHours as Parameters<typeof checkWithinHours>[1];
    const p = checkWithinHours(
      localParts(pickupAt.getTime(), pickupLoc.timezone),
      weeklyP,
      pickupExc,
    );
    if (!p.ok) {
      notices.push({
        code: `pickup_${p.reason}`,
        message: 'The pickup location is closed at that time.',
        field: 'pickupAt',
      });
    }
    const r = checkWithinHours(
      localParts(returnAt.getTime(), returnLoc.timezone),
      weeklyR,
      returnExc,
      {
        allowAfterClose: returnLoc.afterHoursReturn,
      },
    );
    if (!r.ok) {
      notices.push({
        code: `return_${r.reason}`,
        message: returnLoc.afterHoursReturn
          ? 'The return location is closed that day.'
          : 'The return location is closed at that time (no after-hours return).',
        field: 'returnAt',
      });
    }
    return notices;
  }

  async search(input: SearchInput): Promise<SearchResult> {
    const returnCode = input.returnLocationCode ?? input.pickupLocationCode;
    const { loc: pickupLoc, exceptions: pickupExc } = await this.loadLocation(
      input.pickupLocationCode,
    );
    const { loc: returnLoc, exceptions: returnExc } = await this.loadLocation(returnCode);

    const durationHours = Math.ceil(
      (input.returnAt.getTime() - input.pickupAt.getTime()) / 3_600_000,
    );
    const notices = this.validateWindow(
      pickupLoc,
      returnLoc,
      pickupExc.map((e) => ({ date: e.date, closed: e.closed, open: e.open, close: e.close })),
      returnExc.map((e) => ({ date: e.date, closed: e.closed, open: e.open, close: e.close })),
      input.pickupAt,
      input.returnAt,
    );

    const base = {
      pickupLocationCode: input.pickupLocationCode,
      returnLocationCode: returnCode,
      pickupAt: input.pickupAt.toISOString(),
      returnAt: input.returnAt.toISOString(),
      durationHours,
    };

    // A window that breaks a hard rule (inverted, in the past, or outside operating hours) yields
    // no options — the customer sees the reason, not a list they cannot actually book.
    const blocking = notices.some(
      (n) =>
        n.code === 'invalid_window' ||
        n.code === 'past_pickup' ||
        n.code.startsWith('pickup_') ||
        n.code.startsWith('return_'),
    );
    if (blocking) {
      return { ...base, state: 'no_results', options: [], notices };
    }

    const pickupYmd = localParts(input.pickupAt.getTime(), pickupLoc.timezone).date;
    const cats = await this.catalogue.listCategories(
      input.categoryCode ? { codes: [input.categoryCode] } : {},
    );
    const supported = new Set(pickupLoc.supportedCategoryCodes ?? []);

    const options: SearchOption[] = [];
    for (const cat of cats) {
      if (supported.size && !supported.has(cat.code)) continue;
      const { unitIds, occupiedByUnit } = await this.fleet.candidateUnits(
        input.pickupLocationCode,
        cat.code,
        input.pickupAt,
        input.returnAt,
      );
      const classHolds = await this.countHolds(
        cat.code,
        input.pickupLocationCode,
        input.pickupAt,
        input.returnAt,
      );
      const avail = computeAvailability({
        request: { start: input.pickupAt.getTime(), end: input.returnAt.getTime() },
        turnaroundMs: (pickupLoc.turnaroundMinutes ?? 60) * 60_000,
        unitIds,
        occupiedByUnit,
        classHolds,
      });

      let fromTotalMinor: number | null = null;
      let currency: string | null = null;
      try {
        const priced = await this.pricing.priceWindow(
          cat.code,
          input.pickupLocationCode,
          input.pickupAt,
          input.returnAt,
          pickupYmd,
        );
        if (priced) {
          fromTotalMinor = priced.computation.totalMinor;
          currency = priced.currency;
        }
      } catch {
        // a rate-rule violation (min/max duration) just means "no price for this window"
      }

      options.push({
        categoryCode: cat.code,
        categoryName: cat.displayName,
        class: cat.class,
        transmission: cat.transmission,
        passengers: cat.passengers,
        luggage: cat.luggage,
        imageRef: cat.imageRef,
        features: cat.features.map((f) => ({ code: f.code, label: f.label })),
        bookableCount: avail.bookableCount,
        fromTotalMinor,
        currency,
      });
    }

    const bookable = options.filter((o) => o.bookableCount > 0 && o.fromTotalMinor != null);
    return {
      ...base,
      state: bookable.length ? 'fresh' : 'no_results',
      options: options.sort(
        (a, b) => (a.fromTotalMinor ?? Infinity) - (b.fromTotalMinor ?? Infinity),
      ),
      notices,
    };
  }

  /**
   * Capacity already committed against a category + pickup location for a window: live holds
   * (checkout in progress) + confirmed reservations that have not yet been picked up. Both
   * consume a unit from the free pool.
   */
  private async countHolds(
    categoryCode: string,
    pickupLocationCode: string,
    pickupAt: Date,
    returnAt: Date,
    tx?: Database,
    excludeReservationRef?: string,
  ): Promise<number> {
    const db = tx ?? this.db;
    const [holds] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(hold)
      .where(
        and(
          eq(hold.categoryCode, categoryCode),
          eq(hold.pickupLocationCode, pickupLocationCode),
          eq(hold.status, 'active'),
          gt(hold.expiresAt, new Date().toISOString()),
          sql`${hold.pickupAt} < ${returnAt.toISOString()}`,
          sql`${pickupAt.toISOString()} < ${hold.returnAt}`,
        ),
      );
    const [reservations] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(reservation)
      .where(
        and(
          eq(reservation.categoryCode, categoryCode),
          eq(reservation.pickupLocationCode, pickupLocationCode),
          sql`${reservation.state} in ('confirmed','fulfilled')`,
          sql`${reservation.pickupAt} < ${returnAt.toISOString()}`,
          sql`${pickupAt.toISOString()} < ${reservation.returnAt}`,
          excludeReservationRef
            ? sql`${reservation.reference} <> ${excludeReservationRef}`
            : sql`true`,
        ),
      );
    return (holds?.n ?? 0) + (reservations?.n ?? 0);
  }

  /**
   * Atomically confirm capacity and place a hold (FR-BKG-001). A transaction-scoped advisory
   * lock on (org, category, pickup location) serialises concurrent takers so the last unit
   * cannot be double-held.
   */
  async checkAndHold(input: {
    actor: Actor | null;
    organizationId: string;
    categoryCode: string;
    pickupLocationCode: string;
    returnLocationCode: string;
    pickupAt: Date;
    returnAt: Date;
    holderKey: string;
    quoteReference?: string;
    /** when re-holding for a modify, don't count the reservation being changed against itself */
    excludeReservationRef?: string;
  }): Promise<{ id: string; expiresAt: string; unitPinned: boolean }> {
    const lockKey = `${input.organizationId}:${input.categoryCode}:${input.pickupLocationCode}`;
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

      const { unitIds, occupiedByUnit } = await this.fleet.candidateUnits(
        input.pickupLocationCode,
        input.categoryCode,
        input.pickupAt,
        input.returnAt,
      );
      const classHolds = await this.countHolds(
        input.categoryCode,
        input.pickupLocationCode,
        input.pickupAt,
        input.returnAt,
        tx,
        input.excludeReservationRef,
      );
      const { loc } = await this.loadLocation(input.pickupLocationCode);
      const avail = computeAvailability({
        request: { start: input.pickupAt.getTime(), end: input.returnAt.getTime() },
        turnaroundMs: (loc.turnaroundMinutes ?? 60) * 60_000,
        unitIds,
        occupiedByUnit,
        classHolds,
      });
      if (avail.bookableCount < 1) {
        throw AppError.businessRule('That vehicle class is no longer available for those dates', {
          reason: 'no_availability',
        });
      }

      const [row] = await tx
        .insert(hold)
        .values({
          organizationId: input.organizationId,
          categoryCode: input.categoryCode,
          pickupLocationCode: input.pickupLocationCode,
          returnLocationCode: input.returnLocationCode,
          pickupAt: input.pickupAt.toISOString(),
          returnAt: input.returnAt.toISOString(),
          holderKey: input.holderKey,
          quoteReference: input.quoteReference ?? null,
          status: 'active',
          expiresAt: new Date(Date.now() + HOLD_TTL_MS).toISOString(),
          createdBy: input.actor?.accountId ?? null,
        })
        .returning();

      await this.outbox.emit(
        {
          type: 'booking.hold.placed.v1',
          aggregateType: 'hold',
          aggregateId: row!.id,
          payload: {
            categoryCode: input.categoryCode,
            pickupLocationCode: input.pickupLocationCode,
          },
        },
        tx,
      );
      return {
        id: row!.id,
        expiresAt: new Date(row!.expiresAt).toISOString(),
        unitPinned: avail.freeUnitIds.length > 0,
      };
    });
  }

  async releaseHold(actor: Actor, id: string, reason = 'forced'): Promise<void> {
    const [row] = await this.db.select().from(hold).where(eq(hold.id, id)).limit(1);
    if (!row) throw AppError.notFound('hold');
    if (row.status !== 'active') return;
    await this.db
      .update(hold)
      .set({
        status: 'released',
        releasedAt: sql`now()`,
        releaseReason: reason,
        updatedAt: sql`now()`,
      })
      .where(eq(hold.id, id));
    await this.audit.record({
      action: 'booking.hold.released',
      targetType: 'hold',
      targetId: id,
      actor,
      reason,
    });
  }

  async listHolds(status = 'active') {
    return this.db
      .select()
      .from(hold)
      .where(eq(hold.status, status))
      .orderBy(sql`${hold.expiresAt} asc`)
      .limit(200);
  }

  /** Worker hook: expire holds past their TTL. Returns the count expired. */
  async expireStaleHolds(): Promise<number> {
    const res = await this.db
      .update(hold)
      .set({
        status: 'expired',
        releasedAt: sql`now()`,
        releaseReason: 'expired',
        updatedAt: sql`now()`,
      })
      .where(and(eq(hold.status, 'active'), sql`${hold.expiresAt} < now()`))
      .returning({ id: hold.id });
    return res.length;
  }
}
