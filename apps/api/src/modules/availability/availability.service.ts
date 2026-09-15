import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';

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
import { FleetService, type PublicUnitCard } from '../fleet/fleet.service';
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

// ARCH-GAP (2026-09-15 audit, finding #3): `availability` has no availability.public.ts facade,
// even though CLAUDE.md names `availability` as its own worked example of a sub-domain folded
// into a parent module that "must still expose its cross-module surface through the parent's
// .public.ts". AvailabilityService is imported directly, top-level, by
// booking/reservation-ops.service.ts, booking/booking.service.ts, and discovery's own controllers
// instead of through any curated facade. The `apiModuleBoundaries` ESLint rule only blocks
// imports into a *subdirectory* of another module, not a top-level service file like this one, so
// this currently lints clean despite violating the documented convention. Left as-is rather than
// a partial migration — see the identical note on fleet/pricing/catalogue.service.ts: a real fix
// spans fleet, pricing, catalogue, availability, and discovery together (~15 call sites) and
// deserves a dedicated PR with its own DI-wiring verification. Follow-up: add
// availability.public.ts (+ the other four) re-exporting only checkAndHold / releaseHold / search
// / listAvailableUnits — what booking/rental/discovery actually consume today.
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
   * SCREEN-CUS-003b — the specific cars a customer could pick for a category+location+window,
   * before checkout. Same "free" definition `search()`'s class-level count already uses (state +
   * maintenance blocks), minus whatever's already pinned to someone else's live hold/reservation
   * for an overlapping window — a soft best-effort list, not a guarantee: the physical unit is
   * only truly locked in once `checkAndHold` validates + pins it (and even then, `assign()` at
   * pickup time falls back gracefully if it stopped being viable in between).
   */
  async listAvailableUnits(
    categoryCode: string,
    pickupLocationCode: string,
    pickupAt: Date,
    returnAt: Date,
  ): Promise<PublicUnitCard[]> {
    const { unitIds, occupiedByUnit } = await this.fleet.candidateUnits(
      pickupLocationCode,
      categoryCode,
      pickupAt,
      returnAt,
    );
    if (!unitIds.length) return [];
    const { loc, exceptions } = await this.loadLocation(pickupLocationCode);
    // Unlike search(), this never validated the requested window against operating hours at all —
    // it could offer specific cars to pick for a pickup time the location is actually closed at.
    // Same blocking-notice check search() already applies (invalid window, in the past, outside
    // hours), scoped to one location since this function has no separate return-location concept.
    const hoursNotices = this.validateWindow(
      loc,
      loc,
      exceptions.map((e) => ({ date: e.date, closed: e.closed, open: e.open, close: e.close })),
      exceptions.map((e) => ({ date: e.date, closed: e.closed, open: e.open, close: e.close })),
      pickupAt,
      returnAt,
    );
    const hoursBlocking = hoursNotices.some(
      (n) =>
        n.code === 'invalid_window' ||
        n.code === 'past_pickup' ||
        n.code.startsWith('pickup_') ||
        n.code.startsWith('return_'),
    );
    if (hoursBlocking) return [];
    // Real class-level demand (not 0) — this used to ignore other pending reservations/holds that
    // haven't pinned a specific unit yet, so it could keep offering cars to choose from well past
    // the point search()'s bookableCount correctly reports the class as sold out. A customer could
    // pick one, go through checkout, and get rejected at the very last step for no visible reason
    // (checkAndHold's own bookableCount check does reject it there — this was never a double-
    // booking risk, just a confusing dead end).
    const classHolds = await this.countHolds(categoryCode, pickupLocationCode, pickupAt, returnAt);
    const avail = computeAvailability({
      request: { start: pickupAt.getTime(), end: returnAt.getTime() },
      turnaroundMs: (loc.turnaroundMinutes ?? 60) * 60_000,
      unitIds,
      occupiedByUnit,
      classHolds,
    });
    if (!avail.freeUnitIds.length || avail.bookableCount < 1) return [];

    const pinnedElsewhere = new Set<string>();
    const pinnedHolds = await this.db
      .select({ unitId: hold.unitId })
      .from(hold)
      .where(
        and(
          inArray(hold.unitId, avail.freeUnitIds),
          eq(hold.status, 'active'),
          gt(hold.expiresAt, new Date().toISOString()),
          sql`${hold.pickupAt} < ${returnAt.toISOString()}`,
          sql`${pickupAt.toISOString()} < ${hold.returnAt}`,
        ),
      );
    for (const h of pinnedHolds) if (h.unitId) pinnedElsewhere.add(h.unitId);
    const pinnedReservations = await this.db
      .select({ unitId: reservation.unitId })
      .from(reservation)
      .where(
        and(
          inArray(reservation.unitId, avail.freeUnitIds),
          sql`${reservation.state} in ('confirmed','fulfilled')`,
          sql`${reservation.pickupAt} < ${returnAt.toISOString()}`,
          sql`${pickupAt.toISOString()} < ${reservation.returnAt}`,
          // once a rental exists, it's the live commitment (kept in sync at assign() time,
          // including when staff picks something other than the customer's original pin) — the
          // open-rental exclusion already baked into `avail.freeUnitIds` covers it. Still
          // honoring `reservation.unitId` here too would wrongly keep the customer's *original*
          // pick locked out forever even after staff assigned a different car to it.
          sql`not exists (select 1 from rental r where r.reservation_reference = ${reservation.reference})`,
        ),
      );
    for (const r of pinnedReservations) if (r.unitId) pinnedElsewhere.add(r.unitId);
    // a unit currently out on an open rental is already excluded from `avail.freeUnitIds` itself
    // — `FleetService.candidateUnits` feeds it into `occupiedByUnit` the same as a maintenance
    // block, so there's nothing left to filter for that case here.

    // Cap to the real remaining class-level capacity — never offer more choices than
    // `bookableCount` actually allows, even after removing units explicitly pinned elsewhere
    // above (that alone doesn't account for OTHER pending reservations that haven't pinned a
    // specific unit yet but still consume a slot from this same pool).
    const selectable = avail.freeUnitIds
      .filter((id) => !pinnedElsewhere.has(id))
      .slice(0, avail.bookableCount);
    return this.fleet.unitsByIds(selectable);
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
   * Hard rejection if the window falls outside the pickup/return location's operating hours (or
   * is otherwise invalid — inverted, in the past). `checkAndHold()` itself does NOT check this —
   * it trusts the caller to have already validated the window, the same way `search()` does
   * before ever computing availability. `discovery.controller.ts`'s quote endpoint gets this for
   * free by calling `search()` first; any other caller that creates a hold/reservation for a
   * window that hasn't already been through that (e.g. re-holding a NEW window on a reservation
   * modify, not the original one search() already validated) must call this first, or
   * `checkAndHold()` will happily place a hold for a time the location is literally closed at.
   */
  async assertWindowBookable(
    pickupLocationCode: string,
    returnLocationCode: string,
    pickupAt: Date,
    returnAt: Date,
  ): Promise<void> {
    const { loc: pickupLoc, exceptions: pickupExc } = await this.loadLocation(pickupLocationCode);
    const { loc: returnLoc, exceptions: returnExc } = await this.loadLocation(returnLocationCode);
    const notices = this.validateWindow(
      pickupLoc,
      returnLoc,
      pickupExc.map((e) => ({ date: e.date, closed: e.closed, open: e.open, close: e.close })),
      returnExc.map((e) => ({ date: e.date, closed: e.closed, open: e.open, close: e.close })),
      pickupAt,
      returnAt,
    );
    const blocking = notices.find(
      (n) =>
        n.code === 'invalid_window' ||
        n.code === 'past_pickup' ||
        n.code.startsWith('pickup_') ||
        n.code.startsWith('return_'),
    );
    if (blocking) {
      throw AppError.businessRule(blocking.message, { reason: blocking.code });
    }
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
    /** the specific car the customer picked (SCREEN-CUS-003b) — validated free for the window
     *  and not already pinned to someone else's live hold/reservation, else refused outright
     *  rather than silently substituting a different car. */
    preferredUnitId?: string;
    quoteReference?: string;
    /** when re-holding for a modify, don't count the reservation being changed against itself */
    excludeReservationRef?: string;
  }): Promise<{ id: string; expiresAt: string; unitPinned: boolean; unitId: string | null }> {
    const lockKey = `${input.organizationId}:${input.categoryCode}:${input.pickupLocationCode}`;
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

      // The same holder re-requesting a hold on the exact same class/location/window — a retry
      // after a network hiccup, or navigating back and re-submitting the reserve button — is
      // reconsidering, not a second shopper. Release their own still-active prior hold(s) for
      // this exact combination first, so a retry never piles up extra holds against this class's
      // availability (which would otherwise falsely read as scarcer to everyone else).
      await tx
        .update(hold)
        .set({ status: 'released', releasedAt: sql`now()`, releaseReason: 'superseded' })
        .where(
          and(
            eq(hold.holderKey, input.holderKey),
            eq(hold.organizationId, input.organizationId),
            eq(hold.categoryCode, input.categoryCode),
            eq(hold.pickupLocationCode, input.pickupLocationCode),
            eq(hold.pickupAt, input.pickupAt.toISOString()),
            eq(hold.returnAt, input.returnAt.toISOString()),
            eq(hold.status, 'active'),
          ),
        );

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

      let pinnedUnitId: string | null = null;
      if (input.preferredUnitId) {
        if (!avail.freeUnitIds.includes(input.preferredUnitId)) {
          throw AppError.businessRule(
            'That specific vehicle is no longer available for those dates',
            {
              reason: 'unit_unavailable',
            },
          );
        }
        // someone else's live hold or confirmed reservation already has this exact car pinned for
        // an overlapping window — the class itself may still have other free units, but not the
        // one this customer actually asked for.
        const [pinClash] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(hold)
          .where(
            and(
              eq(hold.unitId, input.preferredUnitId),
              eq(hold.status, 'active'),
              gt(hold.expiresAt, new Date().toISOString()),
              sql`${hold.pickupAt} < ${input.returnAt.toISOString()}`,
              sql`${input.pickupAt.toISOString()} < ${hold.returnAt}`,
            ),
          );
        const [resClash] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(reservation)
          .where(
            and(
              eq(reservation.unitId, input.preferredUnitId),
              sql`${reservation.state} in ('confirmed','fulfilled')`,
              sql`${reservation.pickupAt} < ${input.returnAt.toISOString()}`,
              sql`${input.pickupAt.toISOString()} < ${reservation.returnAt}`,
              input.excludeReservationRef
                ? sql`${reservation.reference} <> ${input.excludeReservationRef}`
                : sql`true`,
              // same reasoning as listAvailableUnits: once a reservation has an actual rental,
              // that (kept-in-sync) commitment is what matters, not its stale original pin.
              sql`not exists (select 1 from rental r where r.reservation_reference = ${reservation.reference})`,
            ),
          );
        // an open-rental unit is already excluded from `avail.freeUnitIds` above (the check right
        // before this block already refused it), so there's nothing left to check for that case.
        if ((pinClash?.n ?? 0) > 0 || (resClash?.n ?? 0) > 0) {
          throw AppError.businessRule('That specific vehicle was just taken by another booking', {
            reason: 'unit_unavailable',
          });
        }
        pinnedUnitId = input.preferredUnitId;
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
          unitId: pinnedUnitId,
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
        // A class-level hold (no `preferredUnitId`) never pins a specific car — reporting "any
        // free unit exists" here as `unitPinned:true` falsely told the caller a specific vehicle
        // was secured even when `unitId` comes back null.
        unitPinned: pinnedUnitId !== null,
        unitId: pinnedUnitId,
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
