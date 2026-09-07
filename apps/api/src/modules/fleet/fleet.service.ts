import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { vehicleCategory } from '../../database/schema/catalogue';
import { vehicleBlock, vehicleUnit } from '../../database/schema/fleet';
import { location } from '../../database/schema/org';
import { rental } from '../../database/schema/rental';

export interface UnitRow {
  id: string;
  categoryCode: string;
  categoryName: string;
  currentLocationCode: string;
  homeLocationCode: string;
  vin: string;
  plate: string;
  make: string | null;
  model: string | null;
  year: string | null;
  colour: string | null;
  state: string;
}

/** Bookable vehicle states — a unit not in one of these cannot be counted for availability. */
/** A unit must be `available` to be counted for a new booking — `prep` (just returned, awaiting
 *  readiness), `on_rent`, `maintenance`, etc. are excluded (FR-RNT-013). */
export const BOOKABLE_STATES = ['available'] as const;

export interface BlockRow {
  id: string;
  unitId: string;
  plate: string;
  kind: string;
  reasonCode: string | null;
  startAt: string;
  endAt: string | null;
  note: string | null;
  status: string;
  createdAt: string;
}

@Injectable()
export class FleetService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async listUnits(filter: {
    locationCode?: string;
    categoryCode?: string;
    state?: string;
  }): Promise<UnitRow[]> {
    const rows = await this.db
      .select({
        id: vehicleUnit.id,
        vin: vehicleUnit.vin,
        plate: vehicleUnit.plate,
        make: vehicleUnit.make,
        model: vehicleUnit.model,
        year: vehicleUnit.year,
        colour: vehicleUnit.colour,
        state: vehicleUnit.state,
        categoryCode: vehicleCategory.code,
        categoryName: vehicleCategory.displayName,
        currentLocationCode: location.code,
        homeLocationId: vehicleUnit.homeLocationId,
      })
      .from(vehicleUnit)
      .innerJoin(vehicleCategory, eq(vehicleCategory.id, vehicleUnit.categoryId))
      .innerJoin(location, eq(location.id, vehicleUnit.currentLocationId))
      .orderBy(asc(vehicleCategory.code), asc(vehicleUnit.plate));

    const homeById = new Map(
      (await this.db.select({ id: location.id, code: location.code }).from(location)).map((l) => [
        l.id,
        l.code,
      ]),
    );

    return rows
      .filter(
        (r) =>
          (!filter.locationCode || r.currentLocationCode === filter.locationCode) &&
          (!filter.categoryCode || r.categoryCode === filter.categoryCode) &&
          (!filter.state || r.state === filter.state),
      )
      .map((r) => ({
        id: r.id,
        categoryCode: r.categoryCode,
        categoryName: r.categoryName,
        currentLocationCode: r.currentLocationCode,
        homeLocationCode: homeById.get(r.homeLocationId) ?? r.currentLocationCode,
        vin: r.vin,
        plate: r.plate,
        make: r.make,
        model: r.model,
        year: r.year,
        colour: r.colour,
        state: r.state,
      }));
  }

  /**
   * Candidate unit ids for availability: units of `categoryCode` currently at `locationCode` in a
   * bookable state, plus the occupied intervals (maintenance/admin blocks) per unit that overlap
   * the window. Reservations + rentals are folded in by their modules in later stages via
   * `extraOccupied`.
   */
  async candidateUnits(
    locationCode: string,
    categoryCode: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<{
    unitIds: string[];
    occupiedByUnit: Record<string, Array<{ start: number; end: number }>>;
  }> {
    const units = await this.db
      .select({ id: vehicleUnit.id })
      .from(vehicleUnit)
      .innerJoin(vehicleCategory, eq(vehicleCategory.id, vehicleUnit.categoryId))
      .innerJoin(location, eq(location.id, vehicleUnit.currentLocationId))
      .where(
        and(
          eq(location.code, locationCode),
          eq(vehicleCategory.code, categoryCode),
          inArray(vehicleUnit.state, [...BOOKABLE_STATES]),
        ),
      );
    const unitIds = units.map((u) => u.id);
    const occupiedByUnit: Record<string, Array<{ start: number; end: number }>> = {};
    if (unitIds.length) {
      const blocks = await this.db
        .select()
        .from(vehicleBlock)
        .where(and(inArray(vehicleBlock.unitId, unitIds), eq(vehicleBlock.status, 'active')));
      for (const b of blocks) {
        const start = new Date(b.startAt).getTime();
        const end = b.endAt ? new Date(b.endAt).getTime() : Number.MAX_SAFE_INTEGER;
        if (start < windowEnd.getTime() && windowStart.getTime() < end) {
          (occupiedByUnit[b.unitId] ??= []).push({ start, end });
        }
      }
    }
    return { unitIds, occupiedByUnit };
  }

  /** Maintenance / damage / admin blocks on a unit (SCREEN-OPS-017). Newest first. */
  async listBlocks(filter: { unitId?: string; status?: string } = {}): Promise<BlockRow[]> {
    const where = [
      filter.unitId ? eq(vehicleBlock.unitId, filter.unitId) : undefined,
      filter.status ? eq(vehicleBlock.status, filter.status) : undefined,
    ].filter(Boolean);
    const rows = await this.db
      .select({
        id: vehicleBlock.id,
        unitId: vehicleBlock.unitId,
        plate: vehicleUnit.plate,
        kind: vehicleBlock.kind,
        reasonCode: vehicleBlock.reasonCode,
        startAt: vehicleBlock.startAt,
        endAt: vehicleBlock.endAt,
        note: vehicleBlock.note,
        status: vehicleBlock.status,
        createdAt: vehicleBlock.createdAt,
      })
      .from(vehicleBlock)
      .innerJoin(vehicleUnit, eq(vehicleUnit.id, vehicleBlock.unitId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(vehicleBlock.createdAt))
      .limit(200);
    return rows;
  }

  private async loadUnit(unitId: string) {
    const [u] = await this.db.select().from(vehicleUnit).where(eq(vehicleUnit.id, unitId)).limit(1);
    if (!u) throw AppError.notFound('vehicle unit');
    return u;
  }

  private async hasOpenRental(unitId: string): Promise<boolean> {
    const rows = await this.db
      .select({ reference: rental.reference })
      .from(rental)
      .where(and(eq(rental.unitId, unitId), inArray(rental.state, ['active', 'overdue'])))
      .limit(1);
    return rows.length > 0;
  }

  /**
   * FR-FLT-006 — open a non-rental block on a unit. A `maintenance` block also takes an
   * `available` unit out of service (`state → maintenance`); a unit that is `on_rent` / `prep`
   * keeps its state and the block applies from its window. Never blocks a unit with an open
   * rental for `maintenance` starting now.
   */
  async addBlock(
    actor: Actor,
    input: {
      unitId: string;
      kind?: string;
      reasonCode?: string;
      startAt: string;
      endAt?: string;
      note?: string;
    },
  ): Promise<{ id: string }> {
    const unit = await this.loadUnit(input.unitId);
    const kind = input.kind ?? 'maintenance';
    if (kind === 'maintenance' && (await this.hasOpenRental(unit.id))) {
      throw AppError.businessRule('This unit has an open rental — return it before maintenance', {
        reason: 'open_rental',
      });
    }
    const [row] = await this.db
      .insert(vehicleBlock)
      .values({
        unitId: input.unitId,
        kind,
        reasonCode: input.reasonCode ?? null,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        note: input.note ?? null,
        createdBy: actor.accountId,
      })
      .returning({ id: vehicleBlock.id });
    if (kind === 'maintenance' && unit.state === 'available') {
      await this.db
        .update(vehicleUnit)
        .set({ state: 'maintenance', updatedAt: sql`now()`, updatedBy: actor.accountId })
        .where(eq(vehicleUnit.id, unit.id));
    }
    await this.audit.record({
      action: 'fleet.block.opened',
      targetType: 'vehicle_unit',
      targetId: unit.id,
      actor,
      after: { blockId: row!.id, kind, reasonCode: input.reasonCode ?? null },
    });
    return { id: row!.id };
  }

  /**
   * Release a block. If it was the last active `maintenance` block on a unit that is in
   * `maintenance` (and has no open rental), the unit returns to `available`.
   */
  async releaseBlock(actor: Actor, id: string): Promise<void> {
    const [blk] = await this.db.select().from(vehicleBlock).where(eq(vehicleBlock.id, id)).limit(1);
    if (!blk) throw AppError.notFound('vehicle block');
    await this.db
      .update(vehicleBlock)
      .set({ status: 'released', updatedAt: sql`now()`, updatedBy: actor.accountId })
      .where(eq(vehicleBlock.id, id));

    if (blk.kind === 'maintenance') {
      const stillBlocked = await this.db
        .select({ id: vehicleBlock.id })
        .from(vehicleBlock)
        .where(
          and(
            eq(vehicleBlock.unitId, blk.unitId),
            eq(vehicleBlock.status, 'active'),
            eq(vehicleBlock.kind, 'maintenance'),
          ),
        )
        .limit(1);
      const [unit] = await this.db
        .select({ state: vehicleUnit.state })
        .from(vehicleUnit)
        .where(eq(vehicleUnit.id, blk.unitId))
        .limit(1);
      if (
        !stillBlocked.length &&
        unit?.state === 'maintenance' &&
        !(await this.hasOpenRental(blk.unitId))
      ) {
        await this.db
          .update(vehicleUnit)
          .set({ state: 'available', updatedAt: sql`now()`, updatedBy: actor.accountId })
          .where(eq(vehicleUnit.id, blk.unitId));
      }
    }
    await this.audit.record({
      action: 'fleet.block.released',
      targetType: 'vehicle_unit',
      targetId: blk.unitId,
      actor,
      after: { blockId: id },
    });
  }

  /**
   * FR-FLT-005 — move a unit to another location. Rejected while the unit is `on_rent` or has an
   * open rental (it is not where the system thinks it is). Takes effect immediately; availability
   * counts by `currentLocation`, so the unit is bookable at the destination from now.
   */
  async transferUnit(
    actor: Actor,
    input: { unitId: string; toLocationCode: string; note?: string },
  ): Promise<{ id: string; currentLocationCode: string; state: string }> {
    const unit = await this.loadUnit(input.unitId);
    const [dest] = await this.db
      .select({ id: location.id, code: location.code })
      .from(location)
      .where(eq(location.code, input.toLocationCode))
      .limit(1);
    if (!dest) throw AppError.notFound(`location ${input.toLocationCode}`);
    if (unit.currentLocationId === dest.id) {
      throw AppError.businessRule('The unit is already at that location', { reason: 'no_op' });
    }
    if (unit.state === 'on_rent' || (await this.hasOpenRental(unit.id))) {
      throw AppError.businessRule('This unit has an open rental and cannot be transferred', {
        reason: 'open_rental',
      });
    }
    const [from] = await this.db
      .select({ code: location.code })
      .from(location)
      .where(eq(location.id, unit.currentLocationId))
      .limit(1);
    await this.db
      .update(vehicleUnit)
      .set({
        currentLocationId: dest.id,
        updatedAt: sql`now()`,
        updatedBy: actor.accountId,
      })
      .where(eq(vehicleUnit.id, unit.id));
    await this.audit.record({
      action: 'fleet.unit.transferred',
      targetType: 'vehicle_unit',
      targetId: unit.id,
      actor,
      before: { locationCode: from?.code ?? null },
      after: { locationCode: dest.code, note: input.note ?? null },
    });
    return { id: unit.id, currentLocationCode: dest.code, state: unit.state };
  }
}
