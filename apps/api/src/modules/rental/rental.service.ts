import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { vehicleCategory } from '../../database/schema/catalogue';
import { vehicleUnit } from '../../database/schema/fleet';
import { location, organization } from '../../database/schema/org';
import { inspection, inspectionFinding, rental, rentalEvent } from '../../database/schema/rental';
import { reservation } from '../../database/schema/reservation';
import { PaymentService } from '../payment/payment.service';
import { PricingService } from '../pricing/pricing.service';

const AGREEMENT_VERSION = '1.0';
const FUEL_MINOR_PER_PCT = 150; // $1.50 per missing % of fuel

@Injectable()
export class RentalService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly pricing: PricingService,
    private readonly payments: PaymentService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
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

  // ---------------------------------------------------------- assign + pickup

  async assign(reservationReference: string, actor: Actor, input: { unitId?: string } = {}) {
    this.staffOnly(actor);
    const [res] = await this.db
      .select()
      .from(reservation)
      .where(eq(reservation.reference, reservationReference))
      .limit(1);
    if (!res) throw AppError.notFound('reservation');
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

    await this.db.transaction(async (tx) => {
      await tx
        .update(rental)
        .set({
          state: 'active',
          pickedUpAt: sql`now()`,
          odometerOutKm: input.odometerKm,
          fuelOutPct: input.fuelPct,
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
    if (!['active', 'overdue'].includes(row.state)) {
      throw AppError.businessRule(`A ${row.state} rental cannot be returned`, {
        reason: row.state,
      });
    }

    const findings = input.findings ?? [];
    const damageMinor = findings.reduce((a, f) => a + Math.max(0, f.chargeMinor ?? 0), 0);
    const fuelDeficitPct = Math.max(0, (row.fuelOutPct ?? 100) - input.fuelPct);
    const fuelMinor = fuelDeficitPct * FUEL_MINOR_PER_PCT;
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

  /** Readiness check — moves a returned (`prep`) unit back to `available`. */
  async runReadiness(reference: string, actor: Actor, passed: boolean) {
    this.staffOnly(actor);
    const row = await this.load(reference);
    if (!row.unitId) return this.detail(reference);
    await this.db
      .update(vehicleUnit)
      .set({ state: passed ? 'available' : 'maintenance', updatedAt: sql`now()` })
      .where(eq(vehicleUnit.id, row.unitId));
    await this.db.insert(rentalEvent).values({
      rentalId: row.id,
      reference,
      type: 'readiness',
      note: passed ? 'passed' : 'sent to maintenance',
      actorType: 'staff',
      actorId: actor.accountId,
      actorLabel: actor.displayName,
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

  async list(filter: { state?: string; locationCode?: string }) {
    const where = [];
    if (filter.state) where.push(eq(rental.state, filter.state));
    if (filter.locationCode) where.push(eq(rental.pickupLocationCode, filter.locationCode));
    const rows = await this.db
      .select()
      .from(rental)
      .where(where.length ? and(...where) : sql`true`)
      .orderBy(asc(rental.scheduledPickupAt))
      .limit(200);
    return rows.map((r) => this.shape(r));
  }

  async detail(reference: string) {
    return this.detailTx(this.db, reference);
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
    if (actor.kind !== 'staff') {
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
