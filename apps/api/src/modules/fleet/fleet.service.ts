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
import { ConfigPublic } from '../config/config.public';

/** Minimal RFC-4180-ish CSV parse — quoted fields, "" escapes, CR/LF rows. Header row required. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((c) => c !== '')) rows.push(row);
  }
  if (rows.length < 1) return [];
  const header = rows[0]!.map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, idx) => {
      rec[h] = (r[idx] ?? '').trim();
    });
    return rec;
  });
}

export interface UnitImportResult {
  total: number;
  valid: number;
  committed: boolean;
  created: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

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
    private readonly refData: ConfigPublic,
  ) {}

  async listUnits(
    actor: Actor,
    filter: {
      locationCode?: string;
      categoryCode?: string;
      state?: string;
    },
  ): Promise<{ count: number; total: number; results: UnitRow[] }> {
    const scope = actor.locationScope?.length ? actor.locationScope : null;
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

    // FR-RPT-004 — a location-scoped staffer only sees units currently at their locations.
    const inScope = rows.filter((r) => !scope || scope.includes(r.currentLocationCode));
    const total = inScope.length;
    const results = inScope
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
    return { count: results.length, total, results };
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

  /**
   * Maintenance / damage / admin blocks on a unit (SCREEN-OPS-017). Newest first. A
   * location-scoped staffer only sees blocks on units currently at one of their locations
   * (FR-RPT-004).
   */
  async listBlocks(
    actor: Actor,
    filter: { unitId?: string; status?: string } = {},
  ): Promise<BlockRow[]> {
    const scope = actor.locationScope?.length ? actor.locationScope : null;
    const where = [
      filter.unitId ? eq(vehicleBlock.unitId, filter.unitId) : undefined,
      filter.status ? eq(vehicleBlock.status, filter.status) : undefined,
      scope ? inArray(location.code, scope) : undefined,
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
      .innerJoin(location, eq(location.id, vehicleUnit.currentLocationId))
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

  /** A location-scoped staffer only touches units currently at one of their locations. */
  private async assertUnitInScope(actor: Actor, currentLocationId: string) {
    const scope = actor.locationScope ?? [];
    if (!scope.length) return;
    const [loc] = await this.db
      .select({ code: location.code })
      .from(location)
      .where(eq(location.id, currentLocationId))
      .limit(1);
    if (!loc || !scope.includes(loc.code)) {
      throw AppError.forbidden('This vehicle is outside your assigned locations');
    }
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
    await this.assertUnitInScope(actor, unit.currentLocationId);
    const kind = input.kind ?? 'maintenance';
    if (input.reasonCode) {
      await this.refData.assertLookupCode(
        kind === 'transfer' ? 'transfer_reason' : 'block_reason',
        input.reasonCode,
        'reasonCode',
      );
    }
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
    const unit = await this.loadUnit(blk.unitId);
    await this.assertUnitInScope(actor, unit.currentLocationId);
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
    await this.assertUnitInScope(actor, unit.currentLocationId);
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

  /**
   * FR-FLT-002 — bulk-add units from a CSV (`plate,vin,categoryCode,locationCode,year,make,
   * model,colour`). Every row is validated first (required fields, known category + location,
   * plate/vin unique in the file and against the DB); with `commit: false` this is a dry run.
   * `commit: true` inserts only when there are zero errors — all rows or none.
   */
  async importUnits(
    actor: Actor,
    input: { csv: string; commit: boolean },
  ): Promise<UnitImportResult> {
    const records = parseCsv(input.csv);
    const errors: UnitImportResult['errors'] = [];
    const scope = actor.locationScope?.length ? actor.locationScope : null;

    const cats = await this.db
      .select({ id: vehicleCategory.id, code: vehicleCategory.code })
      .from(vehicleCategory);
    const locs = await this.db
      .select({ id: location.id, code: location.code, organizationId: location.organizationId })
      .from(location);
    const catByCode = new Map(cats.map((c) => [c.code, c.id]));
    const locByCode = new Map(locs.map((l) => [l.code, l]));
    const existing = await this.db
      .select({ vin: vehicleUnit.vin, plate: vehicleUnit.plate })
      .from(vehicleUnit);
    const dbPlates = new Set(existing.map((u) => u.plate.toUpperCase()));
    const dbVins = new Set(existing.map((u) => u.vin.toUpperCase()));

    const seenPlate = new Set<string>();
    const seenVin = new Set<string>();
    const staged: Array<typeof vehicleUnit.$inferInsert> = [];

    records.forEach((rec, i) => {
      const rowNo = i + 2; // 1-based + header
      const err = (field: string, message: string) => errors.push({ row: rowNo, field, message });
      const plate = (rec.plate ?? '').toUpperCase();
      const vin = (rec.vin ?? '').toUpperCase();

      if (!plate) err('plate', 'required');
      else if (seenPlate.has(plate)) err('plate', 'duplicated in the file');
      else if (dbPlates.has(plate)) err('plate', 'already in the fleet');
      if (!vin) err('vin', 'required');
      else if (vin.length < 11 || vin.length > 17) err('vin', 'must be 11–17 characters');
      else if (seenVin.has(vin)) err('vin', 'duplicated in the file');
      else if (dbVins.has(vin)) err('vin', 'already in the fleet');

      const catId = catByCode.get(rec.categoryCode ?? '');
      if (!rec.categoryCode) err('categoryCode', 'required');
      else if (!catId) err('categoryCode', `unknown category "${rec.categoryCode}"`);

      const loc = locByCode.get(rec.locationCode ?? '');
      if (!rec.locationCode) err('locationCode', 'required');
      else if (!loc) err('locationCode', `unknown location "${rec.locationCode}"`);
      else if (scope && !scope.includes(rec.locationCode))
        err('locationCode', `"${rec.locationCode}" is outside your assigned locations`);

      const yr = (rec.year ?? '').trim();
      if (yr && !/^(19|20)\d{2}$/.test(yr)) err('year', 'must be a 4-digit year');

      if (plate) seenPlate.add(plate);
      if (vin) seenVin.add(vin);

      if (catId && loc && plate && vin) {
        staged.push({
          organizationId: loc.organizationId,
          categoryId: catId,
          homeLocationId: loc.id,
          currentLocationId: loc.id,
          vin,
          plate,
          year: rec.year || null,
          make: rec.make || null,
          model: rec.model || null,
          colour: rec.colour || null,
          state: 'available',
          createdBy: actor.accountId,
        });
      }
    });

    const total = records.length;
    const valid = staged.length;
    if (!input.commit || errors.length > 0 || valid === 0) {
      return { total, valid, committed: false, created: 0, errors };
    }

    await this.db.transaction(async (tx) => {
      await tx.insert(vehicleUnit).values(staged);
    });
    await this.audit.record({
      action: 'fleet.units.imported',
      targetType: 'vehicle_unit',
      actor,
      after: { created: valid },
    });
    return { total, valid, committed: true, created: valid, errors: [] };
  }
}
