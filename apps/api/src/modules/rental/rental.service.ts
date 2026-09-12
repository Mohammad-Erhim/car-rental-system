import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import { assertLocationAccess } from '../../common/auth/location-scope';
import type { Actor } from '../../common/auth/types';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { vehicleCategory } from '../../database/schema/catalogue';
import { vehicleBlock, vehicleUnit } from '../../database/schema/fleet';
import { account } from '../../database/schema/iam';
import { location, organization } from '../../database/schema/org';
import { inspection, inspectionFinding, rental, rentalEvent } from '../../database/schema/rental';
import { reservation, reservationDriver } from '../../database/schema/reservation';
import { ConfigVersionService } from '../config/config-version.service';
import { PaymentService } from '../payment/payment.service';
import { PricingService } from '../pricing/pricing.service';

const AGREEMENT_VERSION = '1.0';

@Injectable()
export class RentalService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly pricing: PricingService,
    private readonly payments: PaymentService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigVersionService,
  ) {}

  private async orgId(): Promise<string> {
    const [org] = await this.db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) throw new AppError('resource_not_found', { title: 'No organization configured' });
    return org.id;
  }

  private ref(reservationReference: string): string {
    return `RNT-${createHash('sha256').update(reservationReference).digest('hex').slice(0, 8).toUpperCase()}`;
  }

  private staffOnly(actor: Actor) {
    if (actor.kind !== 'staff') throw AppError.forbidden('Staff only');
  }

  /** A location-scoped staffer only acts on rentals / reservations for their pickup locations. */
  private assertInScope(actor: Actor, pickupLocationCode: string) {
    const scope = actor.locationScope ?? [];
    if (scope.length && !scope.includes(pickupLocationCode)) {
      throw AppError.forbidden('This record is outside your assigned locations');
    }
  }

  // ---------------------------------------------------------- assign + pickup

  async assign(reservationReference: string, actor: Actor, input: { unitId?: string } = {}) {
    this.staffOnly(actor);
    const [res] = await this.db
      .select()
      .from(reservation)
      .where(eq(reservation.reference, reservationReference))
      .limit(1);
    if (!res) throw AppError.notFound('reservation');
    this.assertInScope(actor, res.pickupLocationCode);
    if (res.state !== 'confirmed') {
      throw AppError.businessRule(`Cannot assign a ${res.state} reservation`, {
        reason: res.state,
      });
    }

    const reference = this.ref(reservationReference);
    const [existingRental] = await this.db
      .select()
      .from(rental)
      .where(eq(rental.reference, reference))
      .limit(1);

    const orgId = await this.orgId();

    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`assign:${res.categoryCode}:${res.pickupLocationCode}`}))`,
      );

      let unitId = input.unitId ?? existingRental?.unitId ?? null;
      if (!unitId) {
        // a free `available` unit of the category at the pickup location with no open rental
        const candidates = await tx
          .select({ id: vehicleUnit.id })
          .from(vehicleUnit)
          .innerJoin(vehicleCategory, eq(vehicleCategory.id, vehicleUnit.categoryId))
          .innerJoin(location, eq(location.id, vehicleUnit.currentLocationId))
          .where(
            and(
              eq(vehicleCategory.code, res.categoryCode),
              eq(location.code, res.pickupLocationCode),
              eq(vehicleUnit.state, 'available'),
              sql`${vehicleUnit.id} not in (select unit_id from rental where unit_id is not null and state in ('active','overdue'))`,
            ),
          )
          .limit(1);
        unitId = candidates[0]?.id ?? null;
        if (!unitId) {
          throw AppError.businessRule('No vehicle is available to assign for this reservation', {
            reason: 'no_unit',
          });
        }
      }

      let rentalId: string;
      if (existingRental) {
        await tx
          .update(rental)
          .set({
            unitId,
            version: existingRental.version + 1,
            updatedAt: sql`now()`,
            updatedBy: actor.accountId,
          })
          .where(eq(rental.id, existingRental.id));
        rentalId = existingRental.id;
      } else {
        const [row] = await tx
          .insert(rental)
          .values({
            organizationId: orgId,
            reference,
            reservationReference,
            unitId,
            state: 'awaiting_pickup',
            pickupLocationCode: res.pickupLocationCode,
            returnLocationCode: res.returnLocationCode,
            scheduledPickupAt: res.pickupAt,
            scheduledReturnAt: res.returnAt,
            currency: res.currency,
            createdBy: actor.accountId,
          })
          .returning();
        rentalId = row!.id;
      }
      await tx.insert(rentalEvent).values({
        rentalId,
        reference,
        type: 'assigned',
        detail: { unitId },
        actorType: 'staff',
        actorId: actor.accountId,
        actorLabel: actor.displayName,
      });
      return this.detailTx(tx, reference);
    });
  }

  async pickup(
    reference: string,
    actor: Actor,
    input: { odometerKm: number; fuelPct: number; driverName: string; licenceNumber?: string },
  ) {
    this.staffOnly(actor);
    const row = await this.load(reference);
    this.assertInScope(actor, row.pickupLocationCode);
    if (row.state !== 'awaiting_pickup') {
      throw AppError.businessRule(`Rental is ${row.state}, not awaiting pickup`, {
        reason: row.state,
      });
    }
    if (!row.unitId) {
      throw AppError.businessRule('Assign a vehicle before pickup', { reason: 'no_unit' });
    }
    if (!input.driverName?.trim()) {
      throw AppError.validation(
        [{ path: 'driverName', code: 'required' }],
        'Driver name is required',
      );
    }
    if (!input.licenceNumber?.trim()) {
      throw AppError.validation(
        [{ path: 'licenceNumber', code: 'required' }],
        'A driving licence number is required at pickup',
      );
    }

    // Lock the fuel-recharge rate the customer accepts in the agreement now — a later
    // Configuration → Policy change to `fuel_rate` must not re-rate a car already on the road
    // (FR-PAY-007).
    const fuelPolicy = { minorPerPct: await this.config.policy('fuel_rate', 'minorPerPct') };

    await this.db.transaction(async (tx) => {
      await tx
        .update(rental)
        .set({
          state: 'active',
          pickedUpAt: sql`now()`,
          odometerOutKm: input.odometerKm,
          fuelOutPct: input.fuelPct,
          fuelPolicy,
          agreementVersion: AGREEMENT_VERSION,
          agreementAcceptedAt: sql`now()`,
          version: row.version + 1,
          updatedAt: sql`now()`,
          updatedBy: actor.accountId,
        })
        .where(eq(rental.id, row.id));
      await tx
        .update(vehicleUnit)
        .set({ state: 'on_rent', updatedAt: sql`now()` })
        .where(eq(vehicleUnit.id, row.unitId!));
      await tx
        .update(reservation)
        .set({ state: 'fulfilled', updatedAt: sql`now()` })
        .where(eq(reservation.reference, row.reservationReference));
      await tx.insert(rentalEvent).values({
        rentalId: row.id,
        reference,
        type: 'picked_up',
        detail: { odometerKm: input.odometerKm, fuelPct: input.fuelPct, driver: input.driverName },
        actorType: 'staff',
        actorId: actor.accountId,
        actorLabel: actor.displayName,
      });
      await this.outbox.emit(
        {
          type: 'rental.started.v1',
          aggregateType: 'rental',
          aggregateId: row.id,
          payload: { reference },
        },
        tx,
      );
    });
    await this.audit.record({
      action: 'rental.picked_up',
      targetType: 'rental',
      targetId: row.id,
      actor,
    });
    return this.detail(reference);
  }

  // ------------------------------------------------------------------- extend

  async extend(
    reference: string,
    actor: Actor,
    input: { newReturnAt: string; paymentToken?: string },
  ) {
    const row = await this.load(reference);
    this.assertInScope(actor, row.pickupLocationCode);
    if (!['active', 'overdue'].includes(row.state)) {
      throw AppError.businessRule(`A ${row.state} rental cannot be extended`, {
        reason: row.state,
      });
    }
    const newReturn = new Date(input.newReturnAt);
    if (newReturn.getTime() <= new Date(row.scheduledReturnAt).getTime()) {
      throw AppError.businessRule('The new return must be later than the current one', {
        reason: 'not_later',
      });
    }
    const orgId = await this.orgId();
    const pickupYmd = new Date(row.scheduledPickupAt).toISOString().slice(0, 10);
    const [res] = await this.db
      .select()
      .from(reservation)
      .where(eq(reservation.reference, row.reservationReference))
      .limit(1);
    const oldPriced = await this.pricing.priceWindow(
      res!.categoryCode,
      row.pickupLocationCode,
      new Date(row.scheduledPickupAt),
      new Date(row.scheduledReturnAt),
      pickupYmd,
    );
    const newPriced = await this.pricing.priceWindow(
      res!.categoryCode,
      row.pickupLocationCode,
      new Date(row.scheduledPickupAt),
      newReturn,
      pickupYmd,
    );
    if (!oldPriced || !newPriced) {
      throw AppError.businessRule('No rate is published for the extended dates', {
        reason: 'no_rate_plan',
      });
    }
    const deltaMinor = newPriced.computation.totalMinor - oldPriced.computation.totalMinor;
    if (deltaMinor <= 0) {
      throw AppError.businessRule('The extension does not add any chargeable time', {
        reason: 'no_delta',
      });
    }

    await this.payments.authorizeAndCapture({
      organizationId: orgId,
      reservationReference: row.reservationReference,
      purpose: `extension-${Date.now()}`,
      amountMinor: deltaMinor,
      currency: row.currency,
      token: input.paymentToken ?? 'tok_ok',
      actor,
    });

    await this.db.transaction(async (tx) => {
      await tx
        .update(rental)
        .set({
          scheduledReturnAt: newReturn.toISOString(),
          settlementMinor: row.settlementMinor + deltaMinor,
          version: row.version + 1,
          updatedAt: sql`now()`,
          updatedBy: actor.accountId,
        })
        .where(eq(rental.id, row.id));
      await tx.insert(rentalEvent).values({
        rentalId: row.id,
        reference,
        type: 'extended',
        amountDeltaMinor: deltaMinor,
        detail: { newReturnAt: newReturn.toISOString() },
        actorType: actor.kind,
        actorId: actor.accountId,
        actorLabel: actor.displayName,
      });
    });
    await this.audit.record({
      action: 'rental.extended',
      targetType: 'rental',
      targetId: row.id,
      actor,
      after: { newReturnAt: newReturn.toISOString(), deltaMinor },
    });
    return { ...(await this.detail(reference)), deltaMinor };
  }

  // ---------------------------------------------------------- incident + swap

  /**
   * FR-RNT-016 — log an incident on an in-progress rental and optionally swap the vehicle for a
   * replacement. An immobilised vehicle (always so for an accident) is taken out of service with
   * an open `damage` block; a replacement must be an `available` same-category unit with no open
   * rental. Append-only: an `incident` event is always written, a `replacement` event when the
   * assigned unit changes.
   */
  async raiseIncident(
    reference: string,
    actor: Actor,
    input: {
      category: 'breakdown' | 'accident' | 'damage' | 'other';
      note?: string;
      immobilised?: boolean;
      replacementUnitId?: string;
    },
  ) {
    this.staffOnly(actor);
    const row = await this.load(reference);
    this.assertInScope(actor, row.pickupLocationCode);
    if (!['active', 'overdue'].includes(row.state)) {
      throw AppError.businessRule(`A ${row.state} rental has no vehicle in service`, {
        reason: row.state,
      });
    }
    const immobilised = input.category === 'accident' || input.immobilised === true;

    let replacement: typeof vehicleUnit.$inferSelect | null = null;
    if (input.replacementUnitId) {
      const [cand] = await this.db
        .select()
        .from(vehicleUnit)
        .where(eq(vehicleUnit.id, input.replacementUnitId))
        .limit(1);
      if (!cand) throw AppError.notFound('replacement unit');
      if (cand.id === row.unitId) {
        throw AppError.businessRule('That is the current vehicle', { reason: 'same_unit' });
      }
      if (cand.state !== 'available') {
        throw AppError.businessRule('The replacement vehicle is not available', {
          reason: 'not_available',
        });
      }
      const [openOnCand] = await this.db
        .select({ ref: rental.reference })
        .from(rental)
        .where(and(eq(rental.unitId, cand.id), inArray(rental.state, ['active', 'overdue'])))
        .limit(1);
      if (openOnCand) {
        throw AppError.businessRule('The replacement vehicle is on another rental', {
          reason: 'open_rental',
        });
      }
      const [res] = await this.db
        .select({ categoryCode: reservation.categoryCode })
        .from(reservation)
        .where(eq(reservation.reference, row.reservationReference))
        .limit(1);
      const [candCat] = await this.db
        .select({ code: vehicleCategory.code })
        .from(vehicleCategory)
        .where(eq(vehicleCategory.id, cand.categoryId))
        .limit(1);
      if (res && candCat && res.categoryCode !== candCat.code) {
        throw AppError.businessRule('The replacement is a different vehicle category', {
          reason: 'category_mismatch',
        });
      }
      replacement = cand;
    }

    await this.db.transaction(async (tx) => {
      await tx.insert(rentalEvent).values({
        rentalId: row.id,
        reference,
        type: 'incident',
        reasonCode: input.category,
        note: input.note ?? null,
        detail: { immobilised, unitId: row.unitId },
        actorType: actor.kind,
        actorId: actor.accountId,
        actorLabel: actor.displayName,
      });

      if (immobilised && row.unitId) {
        await tx.insert(vehicleBlock).values({
          unitId: row.unitId,
          kind: 'damage',
          reasonCode: input.category,
          startAt: new Date().toISOString(),
          note: input.note ?? null,
          createdBy: actor.accountId,
        });
      }

      if (replacement) {
        if (row.unitId) {
          await tx
            .update(vehicleUnit)
            .set({
              state: immobilised ? 'out_of_service' : 'prep',
              updatedAt: sql`now()`,
              updatedBy: actor.accountId,
            })
            .where(eq(vehicleUnit.id, row.unitId));
        }
        await tx
          .update(vehicleUnit)
          .set({ state: 'on_rent', updatedAt: sql`now()`, updatedBy: actor.accountId })
          .where(eq(vehicleUnit.id, replacement.id));
        await tx
          .update(rental)
          .set({
            unitId: replacement.id,
            version: row.version + 1,
            updatedAt: sql`now()`,
            updatedBy: actor.accountId,
          })
          .where(eq(rental.id, row.id));
        await tx.insert(rentalEvent).values({
          rentalId: row.id,
          reference,
          type: 'replacement',
          reasonCode: input.category,
          detail: { fromUnitId: row.unitId, toUnitId: replacement.id },
          actorType: actor.kind,
          actorId: actor.accountId,
          actorLabel: actor.displayName,
        });
      } else if (immobilised && row.unitId) {
        await tx
          .update(vehicleUnit)
          .set({ state: 'out_of_service', updatedAt: sql`now()`, updatedBy: actor.accountId })
          .where(eq(vehicleUnit.id, row.unitId));
      }
    });

    await this.audit.record({
      action: replacement ? 'rental.unit.replaced' : 'rental.incident.raised',
      targetType: 'rental',
      targetId: row.id,
      actor,
      after: {
        category: input.category,
        immobilised,
        replacementUnitId: replacement?.id ?? null,
      },
    });
    return this.detail(reference);
  }

  // ------------------------------------------------------------------- return

  async returnRental(
    reference: string,
    actor: Actor,
    input: {
      odometerKm: number;
      fuelPct: number;
      checklist?: Array<{ item: string; ok: boolean }>;
      findings?: Array<{
        area: string;
        severity?: 'minor' | 'major';
        description: string;
        chargeMinor?: number;
      }>;
    },
  ) {
    this.staffOnly(actor);
    const row = await this.load(reference);
    this.assertInScope(actor, row.pickupLocationCode);
    if (!['active', 'overdue'].includes(row.state)) {
      throw AppError.businessRule(`A ${row.state} rental cannot be returned`, {
        reason: row.state,
      });
    }
    if (row.odometerOutKm != null && input.odometerKm < row.odometerOutKm) {
      throw AppError.validation(
        [{ path: 'odometerKm', code: 'min' }],
        `The return odometer (${input.odometerKm} km) cannot be below the pickup reading (${row.odometerOutKm} km)`,
      );
    }

    const findings = input.findings ?? [];
    const damageMinor = findings.reduce((a, f) => a + Math.max(0, f.chargeMinor ?? 0), 0);
    // the rate locked in the agreement at pickup; live policy only for pre-snapshot rentals.
    const fuelMinorPerPct =
      row.fuelPolicy?.minorPerPct ?? (await this.config.policy('fuel_rate', 'minorPerPct'));
    const fuelDeficitPct = Math.max(0, (row.fuelOutPct ?? 100) - input.fuelPct);
    const fuelMinor = fuelDeficitPct * fuelMinorPerPct;
    const adjustmentMinor = damageMinor + fuelMinor;

    if (adjustmentMinor > 0) {
      await this.payments.authorizeAndCapture({
        organizationId: row.organizationId,
        reservationReference: row.reservationReference,
        purpose: `return-settlement-${Date.now()}`,
        amountMinor: adjustmentMinor,
        currency: row.currency,
        token: 'tok_ok',
        actor,
      });
    }

    await this.db.transaction(async (tx) => {
      const [insp] = await tx
        .insert(inspection)
        .values({
          rentalId: row.id,
          kind: 'return',
          outcome: findings.length ? 'issues' : 'pass',
          checklist: input.checklist ?? [],
          createdBy: actor.accountId,
        })
        .returning();
      if (findings.length) {
        await tx.insert(inspectionFinding).values(
          findings.map((f) => ({
            inspectionId: insp!.id,
            area: f.area,
            severity: f.severity ?? 'minor',
            description: f.description,
            chargeMinor: Math.max(0, f.chargeMinor ?? 0),
          })),
        );
      }
      await tx
        .update(rental)
        .set({
          state: 'closed',
          returnedAt: sql`now()`,
          odometerInKm: input.odometerKm,
          fuelInPct: input.fuelPct,
          settlementMinor: row.settlementMinor + adjustmentMinor,
          version: row.version + 1,
          updatedAt: sql`now()`,
          updatedBy: actor.accountId,
        })
        .where(eq(rental.id, row.id));
      // unit goes to `prep` — not bookable until readiness passes (FR-RNT-013)
      await tx
        .update(vehicleUnit)
        .set({ state: 'prep', updatedAt: sql`now()` })
        .where(eq(vehicleUnit.id, row.unitId!));
      await tx.insert(rentalEvent).values({
        rentalId: row.id,
        reference,
        type: 'returned',
        amountDeltaMinor: adjustmentMinor,
        detail: { fuelMinor, damageMinor, odometerKm: input.odometerKm },
        actorType: 'staff',
        actorId: actor.accountId,
        actorLabel: actor.displayName,
      });
      await this.outbox.emit(
        {
          type: 'rental.closed.v1',
          aggregateType: 'rental',
          aggregateId: row.id,
          payload: { reference, adjustmentMinor },
        },
        tx,
      );
    });
    await this.audit.record({
      action: 'rental.returned',
      targetType: 'rental',
      targetId: row.id,
      actor,
      after: { adjustmentMinor, fuelMinor, damageMinor },
    });
    return { ...(await this.detail(reference)), adjustmentMinor, fuelMinor, damageMinor };
  }

  /**
   * Readiness check (FR-RNT-013) — after a return, the unit sits in `prep` and is not bookable
   * until this passes. A pass returns it to `available`; a fail sends it to `maintenance`. Only
   * runs on a `closed` rental, so it can never move an in-service (`on_rent`) unit.
   */
  async runReadiness(reference: string, actor: Actor, passed: boolean) {
    this.staffOnly(actor);
    const row = await this.load(reference);
    this.assertInScope(actor, row.pickupLocationCode);
    if (row.state !== 'closed') {
      throw AppError.businessRule(
        `Readiness runs on a returned rental — this one is ${row.state}`,
        { reason: row.state },
      );
    }
    if (!row.unitId) {
      throw AppError.businessRule('This rental has no vehicle to check', { reason: 'no_unit' });
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(vehicleUnit)
        .set({ state: passed ? 'available' : 'maintenance', updatedAt: sql`now()` })
        .where(eq(vehicleUnit.id, row.unitId!));
      await tx
        .update(rental)
        .set({ version: row.version + 1, updatedAt: sql`now()`, updatedBy: actor.accountId })
        .where(eq(rental.id, row.id));
      await tx.insert(rentalEvent).values({
        rentalId: row.id,
        reference,
        type: 'readiness',
        note: passed ? 'passed' : 'sent to maintenance',
        actorType: 'staff',
        actorId: actor.accountId,
        actorLabel: actor.displayName,
      });
    });
    await this.audit.record({
      action: passed ? 'rental.readiness.passed' : 'rental.readiness.failed',
      targetType: 'rental',
      targetId: row.id,
      actor,
    });
    return this.detail(reference);
  }

  async markOverdue(): Promise<number> {
    const res = await this.db
      .update(rental)
      .set({ state: 'overdue', updatedAt: sql`now()` })
      .where(and(eq(rental.state, 'active'), sql`${rental.scheduledReturnAt} < now()`))
      .returning({ id: rental.id });
    return res.length;
  }

  // ------------------------------------------------------------------- reads

  private async load(reference: string) {
    const [row] = await this.db
      .select()
      .from(rental)
      .where(eq(rental.reference, reference))
      .limit(1);
    if (!row) throw AppError.notFound('rental');
    return row;
  }

  private parseDate(v: string | undefined, field: string): Date | null {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      throw AppError.validation([{ path: field, code: 'invalid_string' }]);
    }
    return d;
  }

  /**
   * The rental board (SCREEN-OPS-009/012/016). Confined to the actor's pickup locations
   * (FR-RPT-004). Each row carries the vehicle (plate + description), the driver and customer
   * names, and a *live* `overdue` flag — an `active` rental past its scheduled return reads as
   * overdue immediately, without waiting for the sweep job. The true `total` is returned so the
   * board never silently hides rows.
   */
  async list(
    actor: Actor,
    filter: {
      state?: string;
      locationCode?: string;
      flow?: 'pickup' | 'return';
      from?: string;
      to?: string;
      limit?: number;
    },
  ) {
    // a location outside the actor's own scope is a 403, not a silently-empty result (SRS-SEC-007)
    assertLocationAccess(actor, filter.locationCode);
    const scope = actor.locationScope?.length ? actor.locationScope : null;
    const liveOverdue = sql`(${rental.state} = 'active' and ${rental.scheduledReturnAt} < now())`;

    const where: SQL[] = [];
    if (filter.locationCode) where.push(eq(rental.pickupLocationCode, filter.locationCode));
    else if (scope) where.push(inArray(rental.pickupLocationCode, scope));
    if (filter.state === 'overdue') {
      where.push(sql`(${rental.state} = 'overdue' or ${liveOverdue})`);
    } else if (filter.state) {
      where.push(eq(rental.state, filter.state));
    }
    const from = this.parseDate(filter.from, 'from');
    const to = this.parseDate(filter.to, 'to');
    const dateCol =
      filter.flow === 'return'
        ? rental.scheduledReturnAt
        : filter.flow === 'pickup'
          ? rental.scheduledPickupAt
          : null;
    if (from) {
      where.push(
        dateCol
          ? gte(dateCol, from.toISOString())
          : sql`(${rental.scheduledPickupAt} >= ${from.toISOString()} or ${rental.scheduledReturnAt} >= ${from.toISOString()})`,
      );
    }
    if (to) {
      where.push(
        dateCol
          ? lte(dateCol, to.toISOString())
          : sql`(${rental.scheduledPickupAt} <= ${to.toISOString()} or ${rental.scheduledReturnAt} <= ${to.toISOString()})`,
      );
    }
    const whereSql = where.length ? and(...where) : sql`true`;

    const rawLimit = Number(filter.limit);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 200);

    const [countRow] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(rental)
      .where(whereSql);

    const rows = await this.db
      .select({
        r: rental,
        plate: vehicleUnit.plate,
        year: vehicleUnit.year,
        make: vehicleUnit.make,
        model: vehicleUnit.model,
        categoryCode: reservation.categoryCode,
        driverName: reservationDriver.fullName,
        customerName: account.displayName,
      })
      .from(rental)
      .leftJoin(vehicleUnit, eq(vehicleUnit.id, rental.unitId))
      .leftJoin(reservation, eq(reservation.reference, rental.reservationReference))
      .leftJoin(
        reservationDriver,
        and(
          eq(reservationDriver.reservationId, reservation.id),
          eq(reservationDriver.role, 'primary_renter'),
        ),
      )
      .leftJoin(account, eq(account.id, reservation.accountId))
      .where(whereSql)
      .orderBy(asc(rental.scheduledPickupAt))
      .limit(limit);

    const now = Date.now();
    const results = rows.map((row) => {
      const overdue =
        row.r.state === 'overdue' ||
        (row.r.state === 'active' && new Date(row.r.scheduledReturnAt).getTime() < now);
      return {
        ...this.shape(row.r),
        overdue,
        plate: row.plate ?? null,
        vehicle: [row.year, row.make, row.model].filter(Boolean).join(' ') || null,
        categoryCode: row.categoryCode ?? null,
        driverName: row.driverName ?? null,
        customerName: row.customerName ?? null,
      };
    });
    const total = countRow?.total ?? results.length;
    return { count: results.length, total, truncated: total > results.length, results };
  }

  async detail(reference: string) {
    const base = await this.detailTx(this.db, reference);
    const [ctx] = await this.db
      .select({
        plate: vehicleUnit.plate,
        year: vehicleUnit.year,
        make: vehicleUnit.make,
        model: vehicleUnit.model,
        categoryCode: reservation.categoryCode,
        driverName: reservationDriver.fullName,
        customerName: account.displayName,
      })
      .from(rental)
      .leftJoin(vehicleUnit, eq(vehicleUnit.id, rental.unitId))
      .leftJoin(reservation, eq(reservation.reference, rental.reservationReference))
      .leftJoin(
        reservationDriver,
        and(
          eq(reservationDriver.reservationId, reservation.id),
          eq(reservationDriver.role, 'primary_renter'),
        ),
      )
      .leftJoin(account, eq(account.id, reservation.accountId))
      .where(eq(rental.reference, reference))
      .limit(1);
    const findings = await this.db
      .select({
        area: inspectionFinding.area,
        severity: inspectionFinding.severity,
        description: inspectionFinding.description,
        chargeMinor: inspectionFinding.chargeMinor,
      })
      .from(inspectionFinding)
      .innerJoin(inspection, eq(inspection.id, inspectionFinding.inspectionId))
      .innerJoin(rental, eq(rental.id, inspection.rentalId))
      .where(eq(rental.reference, reference));
    return {
      ...base,
      plate: ctx?.plate ?? null,
      vehicle: [ctx?.year, ctx?.make, ctx?.model].filter(Boolean).join(' ') || null,
      categoryCode: ctx?.categoryCode ?? null,
      driverName: ctx?.driverName ?? null,
      customerName: ctx?.customerName ?? null,
      findings,
    };
  }

  private async detailTx(db: Database, reference: string) {
    const [row] = await db.select().from(rental).where(eq(rental.reference, reference)).limit(1);
    if (!row) throw AppError.notFound('rental');
    const events = await db
      .select()
      .from(rentalEvent)
      .where(eq(rentalEvent.rentalId, row.id))
      .orderBy(asc(rentalEvent.createdAt));
    return {
      ...this.shape(row),
      history: events.map((e) => ({
        type: e.type,
        at: new Date(e.createdAt).toISOString(),
        amountDeltaMinor: e.amountDeltaMinor,
        note: e.note,
        actor: e.actorLabel ?? e.actorType,
      })),
    };
  }

  private shape(r: typeof rental.$inferSelect) {
    return {
      reference: r.reference,
      reservationReference: r.reservationReference,
      state: r.state,
      unitId: r.unitId,
      pickupLocationCode: r.pickupLocationCode,
      returnLocationCode: r.returnLocationCode,
      scheduledPickupAt: new Date(r.scheduledPickupAt).toISOString(),
      scheduledReturnAt: new Date(r.scheduledReturnAt).toISOString(),
      pickedUpAt: r.pickedUpAt ? new Date(r.pickedUpAt).toISOString() : null,
      returnedAt: r.returnedAt ? new Date(r.returnedAt).toISOString() : null,
      odometerOutKm: r.odometerOutKm,
      odometerInKm: r.odometerInKm,
      fuelOutPct: r.fuelOutPct,
      fuelInPct: r.fuelInPct,
      currency: r.currency,
      settlementMinor: r.settlementMinor,
      agreementVersion: r.agreementVersion,
    };
  }

  /** The rental(s) for the signed-in customer's reservations (SCREEN-CUS-021). */
  async mineForActor(actor: Actor) {
    const resRows = await this.db
      .select({ ref: reservation.reference })
      .from(reservation)
      .where(eq(reservation.accountId, actor.accountId));
    const refs = resRows.map((r) => r.ref);
    if (!refs.length) return [];
    const rows = await this.db
      .select()
      .from(rental)
      .where(inArray(rental.reservationReference, refs))
      .orderBy(desc(rental.createdAt));
    return rows.map((r) => this.shape(r));
  }

  async detailForActor(reference: string, actor: Actor) {
    const row = await this.load(reference);
    if (actor.kind === 'staff') {
      this.assertInScope(actor, row.pickupLocationCode);
    } else {
      const [res] = await this.db
        .select({ accountId: reservation.accountId })
        .from(reservation)
        .where(eq(reservation.reference, row.reservationReference))
        .limit(1);
      if (!res || res.accountId !== actor.accountId) throw AppError.forbidden();
    }
    return this.detail(reference);
  }
}
