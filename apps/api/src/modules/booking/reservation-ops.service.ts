import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, or, sql, type SQL } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import { assertRecordInScope, effectiveLocationCodes } from '../../common/auth/location-scope';
import type { Actor } from '../../common/auth/types';
import { OutboxService } from '../../common/outbox/outbox.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { vehicleUnit } from '../../database/schema/fleet';
import { account } from '../../database/schema/iam';
import { location, organization } from '../../database/schema/org';
import { rental } from '../../database/schema/rental';
import {
  reconciliationException,
  reservation,
  reservationDriver,
  reservationEvent,
  reservationLine,
} from '../../database/schema/reservation';
import { AvailabilityService } from '../availability/availability.service';
import { ConfigVersionService } from '../config/config-version.service';
import { ConfigPublic } from '../config/config.public';
import { InvoicePublic } from '../invoice/invoice.public';
import { NotifyService } from '../notify/notify.service';
import { PaymentService } from '../payment/payment.service';
import { PricingService } from '../pricing/pricing.service';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class ReservationOpsService {
  private readonly logger = new Logger(ReservationOpsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly pricing: PricingService,
    private readonly payments: PaymentService,
    private readonly availability: AvailabilityService,
    private readonly notify: NotifyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigVersionService,
    private readonly refData: ConfigPublic,
    private readonly invoices: InvoicePublic,
  ) {}

  private async orgId(): Promise<string> {
    const [org] = await this.db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) throw new AppError('resource_not_found', { title: 'No organization configured' });
    return org.id;
  }

  private async load(reference: string) {
    const [row] = await this.db
      .select()
      .from(reservation)
      .where(eq(reservation.reference, reference))
      .limit(1);
    if (!row) throw AppError.notFound('reservation');
    return row;
  }

  private assertOwnerOrStaff(
    row: { accountId: string | null; pickupLocationCode?: string; returnLocationCode?: string },
    actor: Actor,
  ) {
    if (actor.kind === 'staff') {
      // a location-scoped staffer touches reservations at either end of the trip (FR-RPT-004) —
      // the same boundary the queue and reports apply.
      assertRecordInScope(
        actor,
        { pickup: row.pickupLocationCode, return: row.returnLocationCode },
        'This reservation is outside your assigned locations',
      );
      return;
    }
    if (row.accountId && row.accountId === actor.accountId) return;
    throw AppError.forbidden('This reservation belongs to another account');
  }

  // --------------------------------------------------------------- staff queue

  private parseDate(v: string | undefined, field: string): Date | null {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      throw AppError.validation([{ path: field, code: 'invalid_string' }]);
    }
    return d;
  }

  /**
   * The staff reservation queue (SCREEN-OPS-004). `view: 'queue'` is the actionable set —
   * confirmed reservations that don't yet have a rental, soonest pickup first (an overdue,
   * still-unassigned booking floats to the top). `view: 'all'` is the browsable list with the
   * state / date filters. Confined to the actor's pickup locations (FR-RPT-004).
   *
   * Paginated (`page` / `pageSize`, soonest pickup first, `reference` as the tie-break so page
   * boundaries are stable). The response carries the true `total`, and `queueCount` — how many
   * bookings need action in the actor's scope (and chosen location) regardless of the view or
   * the other filters — so the UI can badge the "needs action" tab from the "all" view too.
   */
  async list(
    actor: Actor,
    filter: {
      view: 'queue' | 'all';
      state?: string;
      locationCode?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = filter.page === undefined ? 1 : filter.page;
    const pageSize = filter.pageSize === undefined ? DEFAULT_PAGE_SIZE : filter.pageSize;
    if (!Number.isInteger(page) || page < 1) {
      throw AppError.validation([{ path: 'page', code: 'too_small', params: { min: 1 } }]);
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw AppError.validation([{ path: 'pageSize', code: 'out_of_range' }]);
    }

    // `locationCode` may be a comma-separated list (the top-bar filter is multi-select); a code
    // outside the actor's own scope is a 403, not a silently-empty result (SRS-SEC-007)
    const codes = effectiveLocationCodes(actor, filter.locationCode);
    const noRental = sql`not exists (select 1 from rental r where r.reservation_reference = ${reservation.reference})`;

    // The work queue is the pickup branch's job (assign a car before the customer arrives). The
    // browsable list also shows a one-way booking to the branch it is returned to.
    const atPickup = codes ? inArray(reservation.pickupLocationCode, codes) : undefined;
    const atEitherEnd = codes
      ? or(
          inArray(reservation.pickupLocationCode, codes),
          inArray(reservation.returnLocationCode, codes),
        )
      : undefined;
    const queueWhere = and(atPickup, eq(reservation.state, 'confirmed'), noRental);

    const where: Array<SQL | undefined> = [];
    if (filter.view === 'queue') {
      where.push(atPickup, eq(reservation.state, 'confirmed'), noRental);
    } else {
      where.push(atEitherEnd);
      if (filter.state) where.push(eq(reservation.state, filter.state));
    }
    const from = this.parseDate(filter.from, 'from');
    const to = this.parseDate(filter.to, 'to');
    if (from) where.push(gte(reservation.pickupAt, from.toISOString()));
    if (to) where.push(lte(reservation.pickupAt, to.toISOString()));
    const whereSql = and(...where) ?? sql`true`;

    const [[countRow], [queueRow]] = await Promise.all([
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(reservation)
        .where(whereSql),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(reservation)
        .where(queueWhere),
    ]);

    const rows = await this.db
      .select({
        reference: reservation.reference,
        state: reservation.state,
        channel: reservation.channel,
        categoryCode: reservation.categoryCode,
        pickupLocationCode: reservation.pickupLocationCode,
        returnLocationCode: reservation.returnLocationCode,
        pickupAt: reservation.pickupAt,
        returnAt: reservation.returnAt,
        currency: reservation.currency,
        totalMinor: reservation.totalMinor,
        paidMinor: reservation.paidMinor,
        driverName: reservationDriver.fullName,
        assignedRentalRef: sql<
          string | null
        >`(select r.reference from rental r where r.reservation_reference = ${reservation.reference} limit 1)`,
        pickedUnitId: vehicleUnit.id,
        pickedPlate: vehicleUnit.plate,
        pickedMake: vehicleUnit.make,
        pickedModel: vehicleUnit.model,
      })
      .from(reservation)
      .leftJoin(
        reservationDriver,
        and(
          eq(reservationDriver.reservationId, reservation.id),
          eq(reservationDriver.role, 'primary_renter'),
        ),
      )
      .leftJoin(vehicleUnit, eq(vehicleUnit.id, reservation.unitId))
      .where(whereSql)
      .orderBy(asc(reservation.pickupAt), sql`${reservation.reference} COLLATE "C"`)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const total = countRow?.total ?? 0;
    return {
      view: filter.view,
      page,
      pageSize,
      count: rows.length,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      queueCount: queueRow?.total ?? 0,
      results: rows.map((r) => ({
        reference: r.reference,
        state: r.state,
        channel: r.channel,
        categoryCode: r.categoryCode,
        pickupLocationCode: r.pickupLocationCode,
        returnLocationCode: r.returnLocationCode,
        pickupAt: new Date(r.pickupAt).toISOString(),
        returnAt: new Date(r.returnAt).toISOString(),
        currency: r.currency,
        totalMinor: r.totalMinor,
        paidMinor: r.paidMinor,
        driverName: r.driverName,
        assignedRentalRef: r.assignedRentalRef,
        pickedUnit: r.pickedUnitId
          ? { id: r.pickedUnitId, plate: r.pickedPlate, make: r.pickedMake, model: r.pickedModel }
          : null,
      })),
    };
  }

  async history(reference: string, actor: Actor) {
    const row = await this.load(reference);
    this.assertOwnerOrStaff(row, actor);
    const events = await this.db
      .select()
      .from(reservationEvent)
      .where(eq(reservationEvent.reservationId, row.id))
      .orderBy(asc(reservationEvent.createdAt));
    return events.map((e) => ({
      type: e.type,
      at: new Date(e.createdAt).toISOString(),
      reasonCode: e.reasonCode,
      note: e.note,
      amountDeltaMinor: e.amountDeltaMinor,
      actor: e.actorLabel ?? e.actorType,
    }));
  }

  // ------------------------------------------------------------------- cancel

  async cancel(reference: string, actor: Actor, input: { reasonCode?: string; note?: string }) {
    const row = await this.load(reference);
    this.assertOwnerOrStaff(row, actor);

    if (row.state === 'cancelled') {
      // idempotent — return the same result. `row.paidMinor` is already the *post-refund*
      // retained amount (set below when the real cancellation ran), so it cannot be combined
      // with anything to reconstruct what was refunded — the refunded total is simply what the
      // payment intent already records.
      const refunded = await this.refundedTotalMinor(reference);
      return this.detail(reference, actor).then((d) => ({
        ...d,
        refundMinor: refunded,
      }));
    }
    if (!['pending', 'confirmed'].includes(row.state)) {
      throw AppError.businessRule(`A ${row.state} reservation cannot be cancelled here`, {
        reason: 'not_cancellable',
      });
    }

    if (input.reasonCode) {
      await this.refData.assertLookupCode('cancel_reason', input.reasonCode, 'reasonCode');
    }

    // Use the terms snapshotted when the reservation was confirmed (FR-PAY-006); fall back to the
    // live policy only for reservations booked before the snapshot column existed.
    const snap = row.cancelPolicy;
    const freeCancelHours =
      snap?.freeCancelHours ?? (await this.config.policy('cancellation', 'freeCancelHours'));
    const lateFeeBps = snap?.lateFeeBps ?? (await this.config.policy('cancellation', 'lateFeeBps'));
    const hoursToPickup = (new Date(row.pickupAt).getTime() - Date.now()) / 3_600_000;
    const feeMinor =
      actor.kind === 'staff' && input.reasonCode === 'goodwill'
        ? 0
        : hoursToPickup >= freeCancelHours
          ? 0
          : Math.round((row.totalMinor * lateFeeBps) / 10_000);
    const refundMinor = Math.max(0, row.paidMinor - feeMinor);

    if (refundMinor > 0) {
      await this.payments.refund(actor, reference, refundMinor, 'booking');
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(reservation)
        .set({
          state: 'cancelled',
          cancelledAt: sql`now()`,
          cancelReasonCode: input.reasonCode ?? null,
          paidMinor: row.paidMinor - refundMinor,
          version: row.version + 1,
          updatedAt: sql`now()`,
          updatedBy: actor.accountId,
        })
        .where(eq(reservation.id, row.id));
      await tx.insert(reservationEvent).values({
        reservationId: row.id,
        reference,
        type: 'cancelled',
        reasonCode: input.reasonCode ?? null,
        note: input.note ?? null,
        amountDeltaMinor: -refundMinor,
        before: { state: row.state, paidMinor: row.paidMinor },
        after: { state: 'cancelled', feeMinor, refundMinor },
        actorType: actor.kind,
        actorId: actor.accountId,
        actorLabel: actor.displayName,
      });
      await this.outbox.emit(
        {
          type: 'reservation.cancelled.v1',
          aggregateType: 'reservation',
          aggregateId: row.id,
          payload: { reference, refundMinor, feeMinor },
        },
        tx,
      );
    });

    await this.audit.record({
      action: 'reservation.cancelled',
      targetType: 'reservation',
      targetId: row.id,
      actor,
      reason: input.reasonCode,
      before: { state: row.state },
      after: { state: 'cancelled', refundMinor, feeMinor },
    });
    if (refundMinor > 0) {
      this.invoices
        .issueCreditNote(reference, refundMinor, input.reasonCode ?? 'cancellation')
        .catch((err: Error) =>
          this.logger.warn(`credit note failed for ${reference}: ${err.message}`),
        );
    }
    void this.notifySafe(row, reference, 'reservation_cancelled', {
      reference,
      refund: `${(refundMinor / 100).toFixed(2)} ${row.currency}`,
    });

    return { ...(await this.detail(reference, actor)), refundMinor, feeMinor };
  }

  private async refundedTotalMinor(reference: string): Promise<number> {
    const intent = await this.payments.intentFor(reference, 'booking');
    return intent ? intent.refundedMinor : 0;
  }

  // ------------------------------------------------------------------- modify

  async modify(
    reference: string,
    actor: Actor,
    input: {
      pickupAt?: string;
      returnAt?: string;
      categoryCode?: string;
      paymentToken?: string;
      reasonCode?: string;
    },
  ) {
    const row = await this.load(reference);
    this.assertOwnerOrStaff(row, actor);
    if (row.state !== 'confirmed') {
      throw AppError.businessRule(`A ${row.state} reservation cannot be modified`, {
        reason: 'not_modifiable',
      });
    }
    if (input.reasonCode) {
      await this.refData.assertLookupCode('adjustment_reason', input.reasonCode, 'reasonCode');
    }

    const pickupAt = new Date(input.pickupAt ?? row.pickupAt);
    const returnAt = new Date(input.returnAt ?? row.returnAt);
    const categoryCode = input.categoryCode ?? row.categoryCode;
    // A pinned `unitId` belongs to the OLD category (it was chosen — by the customer at checkout
    // or by staff via assign() — against `row.categoryCode`). Carrying it forward unchanged after
    // a category change leaves it pointing at a car of the wrong class; `RentalService.assign()`
    // then loads that stale pin as its default unitId and, with no `existingRental` on a first
    // assign, unconditionally re-validates it against the NEW category and throws
    // `category_mismatch` — blocking staff from assigning any vehicle at all. Clearing it here
    // lets assign() fall through to its normal auto-pick pool for the new category instead.
    const categoryChanged = categoryCode !== row.categoryCode;
    if (!(pickupAt.getTime() < returnAt.getTime())) {
      throw AppError.businessRule('Return must be after pickup', { reason: 'invalid_window' });
    }
    // checkAndHold() below never checks operating hours itself — every other path that reaches it
    // (the discovery/quote endpoint) already went through search()'s own hours validation first.
    // A modify() to a new pickup/return time is a window that has never been validated at all;
    // without this, a customer could "successfully" modify a reservation to a time the location
    // is literally closed at.
    await this.availability.assertWindowBookable(
      row.pickupLocationCode,
      row.returnLocationCode,
      pickupAt,
      returnAt,
    );
    const orgId = await this.orgId();

    // 1) secure the NEW window first (a fresh hold) — a failure here leaves the reservation
    //    untouched, so the original capacity is never lost (TEST-ERR-003).
    let newHold: { id: string } | null = null;
    try {
      newHold = await this.availability.checkAndHold({
        actor,
        organizationId: orgId,
        categoryCode,
        pickupLocationCode: row.pickupLocationCode,
        returnLocationCode: row.returnLocationCode,
        pickupAt,
        returnAt,
        holderKey: `modify-${reference}`,
        quoteReference: row.quoteReference,
        excludeReservationRef: reference,
      });
    } catch (err) {
      if (err instanceof AppError && err.params?.reason === 'no_availability') {
        throw AppError.businessRule('That change is not available for those dates', {
          reason: 'no_availability',
        });
      }
      throw err;
    }

    // 2) re-price the new window
    const pickupYmd = pickupAt.toISOString().slice(0, 10);
    const priced = await this.pricing.priceWindow(
      categoryCode,
      row.pickupLocationCode,
      pickupAt,
      returnAt,
      pickupYmd,
    );
    if (!priced) {
      await this.availability.releaseHold(actor, newHold.id, 'abandoned');
      throw AppError.businessRule('No rate is published for the new dates', {
        reason: 'no_rate_plan',
      });
    }
    const newTotal = priced.computation.totalMinor;
    const deltaMinor = newTotal - row.totalMinor;

    // 3) settle the delta
    try {
      if (deltaMinor > 0) {
        await this.payments.authorizeAndCapture({
          organizationId: orgId,
          reservationReference: reference,
          purpose: `modification-${Date.now()}`,
          amountMinor: deltaMinor,
          currency: row.currency,
          // No fallback to a fixed token: an omitted token lets PaymentService fall back to the
          // reservation's saved payment method (off-session reuse) — see payment.service.ts.
          token: input.paymentToken,
          actor,
        });
      } else if (deltaMinor < 0) {
        await this.payments.refund(actor, reference, -deltaMinor, 'booking');
      }
    } catch (err) {
      await this.availability.releaseHold(actor, newHold.id, 'abandoned');
      throw err;
    }

    // 4) write the new snapshot + history in one transaction
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .update(reservation)
          .set({
            categoryCode,
            ...(categoryChanged ? { unitId: null } : {}),
            pickupAt: pickupAt.toISOString(),
            returnAt: returnAt.toISOString(),
            durationHours: priced.computation.durationHours,
            subtotalMinor: priced.computation.subtotalMinor,
            taxMinor: priced.computation.taxMinor,
            totalMinor: newTotal,
            paidMinor: row.paidMinor + Math.max(deltaMinor, 0) - Math.max(-deltaMinor, 0),
            quoteVersion: row.quoteVersion + 1,
            holdId: newHold!.id,
            version: row.version + 1,
            updatedAt: sql`now()`,
            updatedBy: actor.accountId,
          })
          .where(eq(reservation.id, row.id));

        await tx.delete(reservationLine).where(eq(reservationLine.reservationId, row.id));
        await tx.insert(reservationLine).values(
          priced.computation.lines.map((l, i) => ({
            reservationId: row.id,
            kind: l.kind,
            code: l.code,
            label: l.label,
            quantity: l.quantity,
            unitMinor: l.unitMinor,
            amountMinor: l.amountMinor,
            sortOrder: i,
          })),
        );

        await tx.insert(reservationEvent).values({
          reservationId: row.id,
          reference,
          type: 'modified',
          reasonCode: input.reasonCode ?? null,
          amountDeltaMinor: deltaMinor,
          before: {
            pickupAt: row.pickupAt,
            returnAt: row.returnAt,
            categoryCode: row.categoryCode,
            totalMinor: row.totalMinor,
          },
          after: {
            pickupAt: pickupAt.toISOString(),
            returnAt: returnAt.toISOString(),
            categoryCode,
            totalMinor: newTotal,
          },
          actorType: actor.kind,
          actorId: actor.accountId,
          actorLabel: actor.displayName,
        });

        // consume the new hold; the old window's capacity is freed because the reservation row
        // now points at the new window.
        await this.outbox.emit(
          {
            type: 'reservation.modified.v1',
            aggregateType: 'reservation',
            aggregateId: row.id,
            payload: { reference, deltaMinor },
          },
          tx,
        );
      });
    } catch {
      // Money already moved (step 3) and can't be silently unwound here — same shape as
      // booking.confirm()'s write_after_charge case, so this doesn't become an untracked,
      // silent inconsistency between what was charged/refunded and what the reservation shows.
      await this.payments.openCase({
        organizationId: orgId,
        kind: 'write_after_charge',
        subjectType: 'reservation',
        subjectRef: reference,
        summary: `Modification for ${reference} charged/refunded ${Math.abs(deltaMinor)} but the reservation write failed`,
        detail: { deltaMinor, newHoldId: newHold.id },
      });
      await this.availability.releaseHold(actor, newHold.id, 'abandoned').catch(() => undefined);
      throw new AppError('internal_error', {
        title:
          'We processed your payment change but could not finish updating the reservation — our team has been alerted',
        params: { reason: 'write_after_charge', caseOpened: true },
      });
    }
    await this.availability.releaseHold(actor, newHold.id, 'confirmed').catch(() => undefined);

    await this.audit.record({
      action: 'reservation.modified',
      targetType: 'reservation',
      targetId: row.id,
      actor,
      reason: input.reasonCode,
      before: { pickupAt: row.pickupAt, returnAt: row.returnAt, totalMinor: row.totalMinor },
      after: {
        pickupAt: pickupAt.toISOString(),
        returnAt: returnAt.toISOString(),
        totalMinor: newTotal,
      },
    });

    return { ...(await this.detail(reference, actor)), deltaMinor };
  }

  async markNoShow(reference: string, actor: Actor, note?: string) {
    const row = await this.load(reference);
    if (actor.kind !== 'staff') throw AppError.forbidden();
    this.assertOwnerOrStaff(row, actor); // location-scope guard for staff
    if (row.state !== 'confirmed') {
      throw AppError.businessRule('Only a confirmed reservation can be marked no-show', {
        reason: 'not_confirmed',
      });
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(reservation)
        .set({
          state: 'no_show',
          version: row.version + 1,
          updatedAt: sql`now()`,
          updatedBy: actor.accountId,
        })
        .where(eq(reservation.id, row.id));
      await tx.insert(reservationEvent).values({
        reservationId: row.id,
        reference,
        type: 'no_show',
        note: note ?? null,
        actorType: 'staff',
        actorId: actor.accountId,
        actorLabel: actor.displayName,
      });
    });
    await this.audit.record({
      action: 'reservation.no_show',
      targetType: 'reservation',
      targetId: row.id,
      actor,
    });
    return this.detail(reference, actor);
  }

  /**
   * FR-PAY-006 completeness — a standalone refund staff can trigger for a goodwill gesture or
   * dispute resolution, independent of cancel/modify (which already auto-refund on their own
   * paths, with no manual equivalent for any other case). `PaymentService.refund` already caps
   * the amount at whatever remains captured and un-refunded; this method's own job is the
   * reservation-side bookkeeping (`paidMinor`, the audit-visible event trail) and staff-only
   * access control, same shape as `cancel()`'s own refund step.
   */
  async manualRefund(
    reference: string,
    actor: Actor,
    input: { amountMinor: number; note: string },
  ) {
    const row = await this.load(reference);
    if (actor.kind !== 'staff') throw AppError.forbidden();
    this.assertOwnerOrStaff(row, actor);
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw AppError.validation(
        [{ path: 'amountMinor', code: 'min' }],
        'Refund amount must be a positive integer',
      );
    }
    // a role can cap how much its holders may refund (per-role condition `amountMinorMax`)
    const cap = actor.permissionConditions?.['payment.refund']?.amountMinorMax;
    if (cap !== undefined && input.amountMinor > cap) {
      throw new AppError('forbidden', {
        title: `Your role can refund up to ${(cap / 100).toFixed(2)} — this needs someone with a higher limit`,
        params: { reason: 'over_limit', limitMinor: cap },
      });
    }
    await this.payments.refund(actor, reference, input.amountMinor, 'booking');
    const newPaidMinor = Math.max(0, row.paidMinor - input.amountMinor);
    await this.db.transaction(async (tx) => {
      await tx
        .update(reservation)
        .set({
          paidMinor: newPaidMinor,
          version: row.version + 1,
          updatedAt: sql`now()`,
          updatedBy: actor.accountId,
        })
        .where(eq(reservation.id, row.id));
      await tx.insert(reservationEvent).values({
        reservationId: row.id,
        reference,
        type: 'refunded',
        note: input.note,
        amountDeltaMinor: -input.amountMinor,
        before: { paidMinor: row.paidMinor },
        after: { paidMinor: newPaidMinor },
        actorType: 'staff',
        actorId: actor.accountId,
        actorLabel: actor.displayName,
      });
    });
    await this.audit.record({
      action: 'reservation.refunded',
      targetType: 'reservation',
      targetId: row.id,
      actor,
      after: { amountMinor: input.amountMinor, note: input.note },
    });
    this.invoices
      .issueCreditNote(reference, input.amountMinor, input.note)
      .catch((err: Error) =>
        this.logger.warn(`credit note failed for ${reference}: ${err.message}`),
      );
    return this.detail(reference, actor);
  }

  // ------------------------------------------------------------------- detail

  async detail(reference: string, actor: Actor | null) {
    const row = await this.load(reference);
    if (actor) this.assertOwnerOrStaff(row, actor);
    const lines = await this.db
      .select()
      .from(reservationLine)
      .where(eq(reservationLine.reservationId, row.id))
      .orderBy(asc(reservationLine.sortOrder));
    const drivers = await this.db
      .select()
      .from(reservationDriver)
      .where(eq(reservationDriver.reservationId, row.id));
    const intent = await this.payments.intentFor(reference, 'booking');
    const [assignedRental] = await this.db
      .select({ reference: rental.reference })
      .from(rental)
      .where(eq(rental.reservationReference, reference))
      .limit(1);
    // SCREEN-CUS-003b — the specific car the customer picked before checkout, if any. `assign()`
    // honors this best-effort (falls back to auto-pick if it's no longer viable), so ops sees the
    // customer's request here rather than only finding out via the "Assign vehicle" dialog.
    const pickedUnit = row.unitId
      ? ((
          await this.db
            .select({
              id: vehicleUnit.id,
              plate: vehicleUnit.plate,
              make: vehicleUnit.make,
              model: vehicleUnit.model,
              colour: vehicleUnit.colour,
            })
            .from(vehicleUnit)
            .where(eq(vehicleUnit.id, row.unitId))
            .limit(1)
        )[0] ?? null)
      : null;
    return {
      reference: row.reference,
      state: row.state,
      channel: row.channel,
      assignedRentalRef: assignedRental?.reference ?? null,
      pickedUnit,
      categoryCode: row.categoryCode,
      pickupLocationCode: row.pickupLocationCode,
      returnLocationCode: row.returnLocationCode,
      pickupAt: new Date(row.pickupAt).toISOString(),
      returnAt: new Date(row.returnAt).toISOString(),
      durationHours: row.durationHours,
      currency: row.currency,
      subtotalMinor: row.subtotalMinor,
      taxMinor: row.taxMinor,
      totalMinor: row.totalMinor,
      paidMinor: row.paidMinor,
      refundedMinor: intent?.refundedMinor ?? 0,
      paymentBrand: intent?.methodBrand ?? null,
      paymentLast4: intent?.methodLast4 ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
      lines: lines.map((l) => ({
        kind: l.kind,
        code: l.code,
        label: l.label,
        quantity: l.quantity,
        unitMinor: l.unitMinor,
        amountMinor: l.amountMinor,
      })),
      drivers: drivers.map((d) => ({ role: d.role, fullName: d.fullName, email: d.email })),
      cancellable:
        ['pending', 'confirmed'].includes(row.state) &&
        new Date(row.pickupAt).getTime() > Date.now(),
      modifiable: row.state === 'confirmed' && new Date(row.pickupAt).getTime() > Date.now(),
    };
  }

  /**
   * Notify about the *reservation's* own owner/drivers — never the staff member who happened to
   * perform the action. `actor` used to be passed here directly; for a staff-assisted action that
   * sent the confirmation to whichever agent clicked the button (`actor.accountId`, not even an
   * email address) instead of the customer. Takes the loaded reservation row so it can resolve
   * the real account + drivers + pickup-location contact for FR-ADM-011 audience routing.
   */
  private async notifySafe(
    row: { id: string; accountId: string | null; pickupLocationCode: string },
    reference: string,
    event: string,
    variables: Record<string, unknown>,
  ) {
    let accountEmail: string | undefined;
    let localeCode = 'en';
    if (row.accountId) {
      const [acc] = await this.db
        .select({ email: account.email, localeCode: account.localeCode })
        .from(account)
        .where(eq(account.id, row.accountId))
        .limit(1);
      accountEmail = acc?.email;
      localeCode = acc?.localeCode ?? 'en';
    }
    const drivers = await this.db
      .select({ role: reservationDriver.role, email: reservationDriver.email })
      .from(reservationDriver)
      .where(eq(reservationDriver.reservationId, row.id));
    const primaryEmail = drivers.find((d) => d.role === 'primary_renter')?.email ?? undefined;
    const allDrivers = drivers
      .filter((d): d is typeof d & { email: string } => !!d.email)
      .map((d) => ({ email: d.email }));
    const [pickupLocation] = await this.db
      .select({ contact: location.contact })
      .from(location)
      .where(eq(location.code, row.pickupLocationCode))
      .limit(1);
    const opsEmail = pickupLocation?.contact?.email;

    // Localised last-resort copy for the (rare) case a published template is missing — the
    // normal path renders the seeded `reservation_*` template in the recipient's locale.
    const fallbackByLocale: Record<string, { subject: string; body: string }> = {
      en: {
        subject: `Update on ${reference}`,
        body: `There is an update on your booking ${reference}.`,
      },
      fr: {
        subject: `Mise à jour concernant ${reference}`,
        body: `Votre réservation ${reference} a été mise à jour.`,
      },
      ar: { subject: `تحديث بشأن ${reference}`, body: `هناك تحديث على حجزك ${reference}.` },
    };
    try {
      await this.notify.send({
        event,
        channel: 'email',
        recipient: primaryEmail ?? accountEmail ?? 'unknown',
        recipientRef: row.accountId ?? undefined,
        audience: {
          primary_renter: primaryEmail ? { email: primaryEmail } : undefined,
          account_holder: accountEmail
            ? { email: accountEmail, ref: row.accountId ?? undefined }
            : undefined,
          all_drivers: allDrivers.length ? allDrivers : undefined,
          ops: opsEmail ? { email: opsEmail } : undefined,
        },
        localeCode,
        sourceType: 'reservation',
        sourceId: reference,
        variables,
        fallback: fallbackByLocale[localeCode] ?? fallbackByLocale.en,
      });
    } catch {
      /* non-fatal */
    }
  }

  // -------------------------------------------------------------- reconciliation

  /**
   * FR-PAY-009 — compare the payment ledger against a (simulated) provider statement and record
   * any mismatch as an owned exception. The simulator's statement is the ledger itself unless a
   * `injectMismatch` reference is given (used by the test).
   */
  async reconcile(actor: Actor, opts: { injectMismatchRef?: string } = {}) {
    // Test-only fault injection (fabricates a provider/ledger mismatch for a real reservation)
    // — inert in production so a real reconciliation run can never manufacture a false exception.
    const injectMismatchRef =
      this.env.NODE_ENV === 'production' ? undefined : opts.injectMismatchRef;
    const orgId = await this.orgId();
    const intents = await this.payments.allCapturedIntents();
    let created = 0;
    for (const it of intents) {
      const providerAmount =
        injectMismatchRef && it.reservationReference === injectMismatchRef
          ? it.amountMinor - 100
          : it.amountMinor - it.refundedMinor;
      const ledgerAmount = it.amountMinor - it.refundedMinor;
      if (providerAmount !== ledgerAmount) {
        await this.payments.openReconciliationException({
          organizationId: orgId,
          reservationReference: it.reservationReference,
          intentId: it.id,
          kind: 'amount_mismatch',
          ledgerAmountMinor: ledgerAmount,
          providerAmountMinor: providerAmount,
        });
        created++;
      }
    }
    await this.audit.record({
      action: 'payment.reconciled',
      targetType: 'reconciliation_run',
      targetId: new Date().toISOString(),
      actor,
      after: { exceptionsOpened: created },
    });
    return { exceptionsOpened: created };
  }

  async listExceptions() {
    return this.payments.listReconciliationExceptions();
  }

  async resolveException(actor: Actor, id: string, note: string) {
    await this.payments.resolveReconciliationException(actor, id, note);
    await this.audit.record({
      action: 'payment.reconciliation.resolved',
      targetType: 'reconciliation_exception',
      targetId: id,
      actor,
      after: { note },
    });
  }

  async openCasesList() {
    return this.payments.listOpenCases();
  }

  async resolveCase(actor: Actor, id: string, note: string) {
    const kase = await this.payments.getCase(id);
    if (!kase) throw AppError.notFound('recovery case');
    if (kase.state === 'resolved') {
      throw new AppError('validation_failed', { title: 'This case is already resolved' });
    }
    await this.payments.resolveCase(actor, id, note);
    await this.audit.record({
      action: 'recovery_case.resolved',
      targetType: 'recovery_case',
      targetId: id,
      actor,
      after: { note },
    });
  }

  /**
   * FR-INT-002 — retry an owned recovery case. "Retry" re-signals the case to the outbox and
   * re-checks the underlying inconsistency; if it is gone the case auto-resolves, otherwise the
   * attempt is recorded (`detail.retryCount` / `lastRetryAt` / `lastRetryOutcome`) and the case
   * stays open so a human still works it — never a silent close. It never fabricates a
   * reservation or moves money.
   */
  async retryCase(actor: Actor, id: string) {
    const kase = await this.payments.getCase(id);
    if (!kase) throw AppError.notFound('recovery case');
    if (kase.state === 'resolved') {
      throw new AppError('validation_failed', { title: 'This case is already resolved' });
    }

    await this.outbox.emit({
      type: 'recovery_case.retry_requested.v1',
      aggregateType: 'recovery_case',
      aggregateId: id,
      payload: { kind: kase.kind, subjectType: kase.subjectType, subjectRef: kase.subjectRef },
    });

    // is the inconsistency this case tracks still present?
    let consistentNow = false;
    if (kase.subjectType === 'reservation') {
      const [row] = await this.db
        .select({ reference: reservation.reference })
        .from(reservation)
        .where(eq(reservation.reference, kase.subjectRef))
        .limit(1);
      consistentNow = Boolean(row);
    }
    if (['reconcile', 'amount_mismatch'].includes(kase.kind)) {
      await this.reconcile(actor);
      const open = await this.db
        .select({ id: reconciliationException.id })
        .from(reconciliationException)
        .where(
          and(
            eq(reconciliationException.state, 'open'),
            eq(reconciliationException.reservationReference, kase.subjectRef),
          ),
        );
      consistentNow = open.length === 0;
    }

    const retryCount = Number((kase.detail as Record<string, unknown>)?.retryCount ?? 0) + 1;
    const outcome = consistentNow ? 'resolved' : 'still_open';
    await this.payments.patchCaseDetail(id, {
      retryCount,
      lastRetryAt: new Date().toISOString(),
      lastRetryOutcome: outcome,
    });
    if (consistentNow) {
      await this.payments.resolveCase(actor, id, `Auto-resolved on retry #${retryCount}`);
    }

    await this.audit.record({
      action: 'recovery_case.retried',
      targetType: 'recovery_case',
      targetId: id,
      actor,
      after: { retryCount, outcome, kind: kase.kind },
    });

    return { id, state: consistentNow ? 'resolved' : kase.state, outcome, retryCount };
  }

  async mineForActor(actor: Actor) {
    const rows = await this.db
      .select()
      .from(reservation)
      .where(
        and(
          eq(reservation.accountId, actor.accountId),
          inArray(reservation.state, ['pending', 'confirmed', 'cancelled', 'no_show', 'fulfilled']),
        ),
      )
      .orderBy(desc(reservation.createdAt))
      .limit(50);
    return rows.map((r) => ({
      reference: r.reference,
      state: r.state,
      categoryCode: r.categoryCode,
      pickupLocationCode: r.pickupLocationCode,
      pickupAt: new Date(r.pickupAt).toISOString(),
      returnAt: new Date(r.returnAt).toISOString(),
      totalMinor: r.totalMinor,
      currency: r.currency,
    }));
  }
}
