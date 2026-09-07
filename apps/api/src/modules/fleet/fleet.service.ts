import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { vehicleCategory } from '../../database/schema/catalogue';
import { vehicleBlock, vehicleUnit } from '../../database/schema/fleet';
import { location } from '../../database/schema/org';

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

@Injectable()
export class FleetService {
  constructor(@Inject(DB) private readonly db: Database) {}

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
    const [row] = await this.db
      .insert(vehicleBlock)
      .values({
        unitId: input.unitId,
        kind: input.kind ?? 'maintenance',
        reasonCode: input.reasonCode ?? null,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        note: input.note ?? null,
        createdBy: actor.accountId,
      })
      .returning({ id: vehicleBlock.id });
    return { id: row!.id };
  }

  async releaseBlock(actor: Actor, id: string): Promise<void> {
    await this.db
      .update(vehicleBlock)
      .set({ status: 'released', updatedAt: sql`now()`, updatedBy: actor.accountId })
      .where(eq(vehicleBlock.id, id));
  }
}
