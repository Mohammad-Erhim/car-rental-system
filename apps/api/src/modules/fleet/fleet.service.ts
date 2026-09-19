import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import { assertLocationAccess, effectiveLocationCodes } from '../../common/auth/location-scope';
import type { Actor } from '../../common/auth/types';
import { isUniqueViolation } from '../../common/db-error';
import { ObjectStorageService } from '../../common/object-storage/object-storage.service';
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
  imageRef: string | null;
  imageUrl: string | null;
  version: number;
}

/** What a customer sees when choosing a specific car (SCREEN-CUS-003b) — deliberately no plate/
 *  VIN, matching the existing "identity is verified at the counter" convention. */
export interface PublicUnitCard {
  id: string;
  make: string | null;
  model: string | null;
  year: string | null;
  colour: string | null;
  imageUrl: string | null;
}

export interface UpsertUnitInput {
  categoryCode: string;
  locationCode?: string;
  vin: string;
  plate: string;
  year?: string;
  make?: string;
  model?: string;
  colour?: string;
  imageRef?: string | null;
}

/** Bookable vehicle states — a unit not in one of these cannot be counted for availability. */
/** A unit must be `available` to be counted for a new booking — `prep` (just returned, awaiting
 *  readiness), `on_rent`, `maintenance`, etc. are excluded (FR-RNT-013). */
export const BOOKABLE_STATES = ['available'] as const;

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export interface UnitList {
  page: number;
  pageSize: number;
  /** units on this page (every match when pagination wasn't requested) */
  count: number;
  /** units matching the current filters */
  total: number;
  pageCount: number;
  /** units per state under the location / category / q filters, ignoring the state filter */
  stateCounts: Record<string, number>;
  results: UnitRow[];
}

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

// ARCH-GAP (2026-09-15 audit, finding #3): `fleet` has no fleet.public.ts facade, even though
// CLAUDE.md's "API module anatomy" section requires one for a sub-domain folded into a parent
// module ("must still expose its cross-module surface through the parent's .public.ts").
// FleetService is imported directly, top-level, by availability.service.ts and
// discovery/ops-catalogue.controller.ts today (and wired straight into DiscoveryModule's
// providers/exports) rather than through any curated facade. The `apiModuleBoundaries` ESLint
// rule only blocks imports into a *subdirectory* of another module, not a top-level service file
// like this one, so the gap currently lints clean despite violating the documented convention.
// Left as-is rather than a partial migration: introducing .public.ts facades across fleet,
// pricing, catalogue, availability, and discovery together touches ~15 cross-module call sites
// (booking, rental, discovery's own controllers, plus these sub-domains importing each other) and
// deserves a dedicated PR with its own DI-wiring verification, not a piecemeal fix bundled into
// unrelated business-logic findings. Follow-up: add fleet.public.ts / pricing.public.ts /
// catalogue.public.ts / availability.public.ts / discovery.public.ts, each re-exporting only what
// cross-module callers actually use, then migrate every call site above in one pass.
/** A retired branch can't receive cars: units created or moved there would vanish from every list. */
function assertLocationActive(status: string, code: string): void {
  if (status !== 'active') {
    throw AppError.businessRule(
      `Location ${code} is archived — restore it before adding cars there`,
      {
        reason: 'location_archived',
      },
    );
  }
}

@Injectable()
export class FleetService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly refData: ConfigPublic,
    private readonly storage: ObjectStorageService,
  ) {}

  /**
   * Fleet inventory. Filters: location / category / state / free text `q` (plate, VIN, make or
   * model). Pagination is opt-in: pass `page` and/or `pageSize` (default 25, max 100) for a page
   * — the inventory screen does — and omit both to get every matching unit, which is what the
   * assign / reassign / incident-replacement pickers need (they must see the full candidate set).
   * `stateCounts` counts units per state under the location / category / `q` filters, ignoring
   * the state filter, so the UI can show the whole fleet's shape while one state is selected.
   */
  async listUnits(
    actor: Actor,
    filter: {
      locationCode?: string;
      categoryCode?: string;
      state?: string;
      q?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<UnitList> {
    const paged = filter.page !== undefined || filter.pageSize !== undefined;
    const page = filter.page === undefined ? 1 : filter.page;
    const pageSize = filter.pageSize === undefined ? DEFAULT_PAGE_SIZE : filter.pageSize;
    if (!Number.isInteger(page) || page < 1) {
      throw AppError.validation([{ path: 'page', code: 'too_small', params: { min: 1 } }]);
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw AppError.validation([{ path: 'pageSize', code: 'out_of_range' }]);
    }
    const needle = (filter.q ?? '').trim().toLowerCase();
    // `locationCode` may be a comma-separated list (top-bar filter); a code outside the actor's
    // own scope is a 403, not a silently-empty result (SRS-SEC-007). With none requested this is
    // the actor's own scope (or null = org-wide).
    const codes = effectiveLocationCodes(actor, filter.locationCode);
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
        imageRef: vehicleUnit.imageRef,
        version: vehicleUnit.version,
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
    const inScope = rows.filter((r) => !codes || codes.includes(r.currentLocationCode));
    // `vehicleUnit.state` only flips to `on_rent` at actual pickup — a unit already assigned to
    // an `awaiting_pickup` rental still reads `available` here. A caller asking for genuinely
    // pickable units (the assign/reassign/incident-replacement dropdowns all do) would otherwise
    // be shown a car that's already committed elsewhere and get refused the moment they pick it.
    let openRentalUnitIds: Set<string> | null = null;
    if (filter.state === 'available') {
      const openRentals = await this.db
        .select({ unitId: rental.unitId })
        .from(rental)
        .where(sql`${rental.state} in ('awaiting_pickup','active','overdue')`);
      openRentalUnitIds = new Set(
        openRentals.map((r) => r.unitId).filter((id): id is string => !!id),
      );
    }
    // everything except the state filter — the per-state counts share it
    const matching = inScope.filter(
      (r) =>
        (!filter.categoryCode || r.categoryCode === filter.categoryCode) &&
        (!needle ||
          [r.plate, r.vin, r.make, r.model].some((v) => (v ?? '').toLowerCase().includes(needle))),
    );
    const stateCounts: Record<string, number> = { all: matching.length };
    for (const r of matching) stateCounts[r.state] = (stateCounts[r.state] ?? 0) + 1;

    const filtered = matching.filter(
      (r) => (!filter.state || r.state === filter.state) && !openRentalUnitIds?.has(r.id),
    );
    const total = filtered.length;
    const slice = paged ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered;
    const results = slice.map((r) => ({
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
      imageRef: r.imageRef,
      imageUrl: r.imageRef ? this.storage.signRef(r.imageRef, 7 * 24 * 3600) : null,
      version: r.version,
    }));
    return {
      page,
      pageSize: paged ? pageSize : Math.max(total, 1),
      count: results.length,
      total,
      pageCount: paged ? Math.max(1, Math.ceil(total / pageSize)) : 1,
      stateCounts,
      results,
    };
  }

  private async unitToRow(id: string): Promise<UnitRow> {
    const [r] = await this.db
      .select({
        id: vehicleUnit.id,
        vin: vehicleUnit.vin,
        plate: vehicleUnit.plate,
        make: vehicleUnit.make,
        model: vehicleUnit.model,
        year: vehicleUnit.year,
        colour: vehicleUnit.colour,
        state: vehicleUnit.state,
        imageRef: vehicleUnit.imageRef,
        version: vehicleUnit.version,
        homeLocationId: vehicleUnit.homeLocationId,
        categoryCode: vehicleCategory.code,
        categoryName: vehicleCategory.displayName,
        currentLocationCode: location.code,
      })
      .from(vehicleUnit)
      .innerJoin(vehicleCategory, eq(vehicleCategory.id, vehicleUnit.categoryId))
      .innerJoin(location, eq(location.id, vehicleUnit.currentLocationId))
      .where(eq(vehicleUnit.id, id))
      .limit(1);
    if (!r) throw AppError.notFound('vehicle unit');
    const [home] = await this.db
      .select({ code: location.code })
      .from(location)
      .where(eq(location.id, r.homeLocationId))
      .limit(1);
    return {
      id: r.id,
      categoryCode: r.categoryCode,
      categoryName: r.categoryName,
      currentLocationCode: r.currentLocationCode,
      homeLocationCode: home?.code ?? r.currentLocationCode,
      vin: r.vin,
      plate: r.plate,
      make: r.make,
      model: r.model,
      year: r.year,
      colour: r.colour,
      state: r.state,
      imageRef: r.imageRef,
      imageUrl: r.imageRef ? this.storage.signRef(r.imageRef, 7 * 24 * 3600) : null,
      version: r.version,
    };
  }

  /**
   * FR-FLT-001/002 — add a single physical vehicle to the fleet outside a bulk CSV import
   * (fixing a typo'd plate, onboarding one car at a time). Home and current location start the
   * same, matching the CSV import's own convention; relocating afterwards is `transferUnit`'s
   * job, not this endpoint's.
   */
  async createUnit(actor: Actor, input: UpsertUnitInput): Promise<UnitRow> {
    if (!input.locationCode) {
      throw AppError.validation([{ path: 'locationCode', code: 'required' }]);
    }
    assertLocationAccess(actor, input.locationCode);
    const [cat] = await this.db
      .select({ id: vehicleCategory.id })
      .from(vehicleCategory)
      .where(eq(vehicleCategory.code, input.categoryCode))
      .limit(1);
    if (!cat) throw AppError.notFound(`vehicle category ${input.categoryCode}`);
    const [loc] = await this.db
      .select({
        id: location.id,
        organizationId: location.organizationId,
        status: location.status,
      })
      .from(location)
      .where(eq(location.code, input.locationCode))
      .limit(1);
    if (!loc) throw AppError.notFound(`location ${input.locationCode}`);
    assertLocationActive(loc.status, input.locationCode);

    const plate = input.plate.toUpperCase().trim();
    const vin = input.vin.toUpperCase().trim();
    let row: typeof vehicleUnit.$inferSelect | undefined;
    try {
      [row] = await this.db
        .insert(vehicleUnit)
        .values({
          organizationId: loc.organizationId,
          categoryId: cat.id,
          homeLocationId: loc.id,
          currentLocationId: loc.id,
          vin,
          plate,
          year: input.year || null,
          make: input.make || null,
          model: input.model || null,
          colour: input.colour || null,
          imageRef: input.imageRef ?? null,
          state: 'available',
          createdBy: actor.accountId,
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('state_conflict', {
          title: 'That plate or VIN is already in the fleet',
          params: { reason: 'duplicate' },
        });
      }
      throw err;
    }
    await this.audit.record({
      action: 'fleet.unit.created',
      targetType: 'vehicle_unit',
      targetId: row!.id,
      actor,
      after: { plate, vin, categoryCode: input.categoryCode, locationCode: input.locationCode },
    });
    return this.unitToRow(row!.id);
  }

  /**
   * Edit a unit's identity/descriptive fields. Location is deliberately not editable here — that
   * is `transferUnit`'s job, with its own open-rental guard; state is not editable here either —
   * it only ever changes through the block/transfer/pickup/return/readiness/retire workflows.
   */
  async updateUnit(
    actor: Actor,
    id: string,
    input: Partial<UpsertUnitInput>,
    expectedVersion?: number,
  ): Promise<UnitRow> {
    const unit = await this.loadUnit(id);
    await this.assertUnitInScope(actor, unit.currentLocationId);
    let categoryId = unit.categoryId;
    if (input.categoryCode) {
      const [cat] = await this.db
        .select({ id: vehicleCategory.id })
        .from(vehicleCategory)
        .where(eq(vehicleCategory.code, input.categoryCode))
        .limit(1);
      if (!cat) throw AppError.notFound(`vehicle category ${input.categoryCode}`);
      categoryId = cat.id;
    }
    const versionGuard =
      expectedVersion != null
        ? and(eq(vehicleUnit.id, id), eq(vehicleUnit.version, expectedVersion))
        : eq(vehicleUnit.id, id);
    let row: typeof vehicleUnit.$inferSelect | undefined;
    try {
      [row] = await this.db
        .update(vehicleUnit)
        .set({
          categoryId,
          vin: input.vin ? input.vin.toUpperCase().trim() : unit.vin,
          plate: input.plate ? input.plate.toUpperCase().trim() : unit.plate,
          year: input.year !== undefined ? input.year || null : unit.year,
          make: input.make !== undefined ? input.make || null : unit.make,
          model: input.model !== undefined ? input.model || null : unit.model,
          colour: input.colour !== undefined ? input.colour || null : unit.colour,
          imageRef: input.imageRef !== undefined ? input.imageRef : unit.imageRef,
          version: unit.version + 1,
          updatedAt: sql`now()`,
          updatedBy: actor.accountId,
        })
        .where(versionGuard)
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('state_conflict', {
          title: 'That plate or VIN is already in the fleet',
          params: { reason: 'duplicate' },
        });
      }
      throw err;
    }
    if (!row) {
      throw new AppError('state_conflict', {
        title: 'This vehicle was changed elsewhere — reload and try again',
        params: { reason: 'version_mismatch', current: unit.version },
      });
    }
    await this.audit.record({
      action: 'fleet.unit.updated',
      targetType: 'vehicle_unit',
      targetId: id,
      actor,
      after: { vin: row.vin, plate: row.plate },
    });
    return this.unitToRow(id);
  }

  /**
   * FR-FLT — retire a vehicle out of the active fleet for good (sold, written off, decommissioned)
   * — never a hard delete, so its rental/audit/financial history stays intact. Blocked while the
   * unit has an open rental, same guard as transfer. `restore` exists for the honest-mistake case
   * (retired the wrong plate) and brings it back as `available`.
   */
  async setUnitRetired(actor: Actor, id: string, retired: boolean): Promise<UnitRow> {
    const unit = await this.loadUnit(id);
    await this.assertUnitInScope(actor, unit.currentLocationId);
    if (retired) {
      if (unit.state === 'on_rent' || (await this.hasOpenRental(id))) {
        throw AppError.businessRule('This vehicle has an open rental and cannot be retired', {
          reason: 'open_rental',
        });
      }
      if (unit.state === 'retired') {
        throw AppError.businessRule('This vehicle is already retired', { reason: 'no_op' });
      }
    } else if (unit.state !== 'retired') {
      throw AppError.businessRule('This vehicle is not retired', { reason: 'no_op' });
    }
    await this.db
      .update(vehicleUnit)
      .set({
        state: retired ? 'retired' : 'available',
        version: unit.version + 1,
        updatedAt: sql`now()`,
        updatedBy: actor.accountId,
      })
      .where(eq(vehicleUnit.id, id));
    await this.audit.record({
      action: retired ? 'fleet.unit.retired' : 'fleet.unit.restored',
      targetType: 'vehicle_unit',
      targetId: id,
      actor,
    });
    return this.unitToRow(id);
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
      // a unit currently committed to an open rental occupies it too (the engine's own contract
      // already says so — "confirmed rentals, held reservations, maintenance/blocks" — this was
      // simply never wired up, which under-counted availability by never excluding a car that's
      // literally out with another customer right now). Unbounded, not time-windowed to the
      // scheduled return: this system's "one open rental per unit" invariant (`assign()`'s own
      // clash check, backed by a DB unique constraint) is itself date-unaware — a unit already
      // committed to an open rental cannot take a second one for ANY future window until the
      // first is actually closed, so offering it as pickable for a later date it doesn't yet
      // know it'll be free by would promise something `assign()` won't actually honor.
      const openRentals = await this.db
        .select({ unitId: rental.unitId, scheduledPickupAt: rental.scheduledPickupAt })
        .from(rental)
        .where(
          and(
            inArray(rental.unitId, unitIds),
            sql`${rental.state} in ('awaiting_pickup','active','overdue')`,
          ),
        );
      for (const r of openRentals) {
        if (!r.unitId) continue;
        const start = new Date(r.scheduledPickupAt).getTime();
        if (start < windowEnd.getTime()) {
          (occupiedByUnit[r.unitId] ??= []).push({ start, end: Number.MAX_SAFE_INTEGER });
        }
      }
    }
    return { unitIds, occupiedByUnit };
  }

  /** Public-safe display cards for a set of unit ids (SCREEN-CUS-003b) — no plate/VIN. */
  async unitsByIds(ids: string[]): Promise<PublicUnitCard[]> {
    if (!ids.length) return [];
    const rows = await this.db
      .select({
        id: vehicleUnit.id,
        make: vehicleUnit.make,
        model: vehicleUnit.model,
        year: vehicleUnit.year,
        colour: vehicleUnit.colour,
        imageRef: vehicleUnit.imageRef,
      })
      .from(vehicleUnit)
      .where(inArray(vehicleUnit.id, ids));
    return rows.map((r) => ({
      id: r.id,
      make: r.make,
      model: r.model,
      year: r.year,
      colour: r.colour,
      imageUrl: r.imageRef ? this.storage.signRef(r.imageRef, 3600) : null,
    }));
  }

  /**
   * Maintenance / damage / admin blocks on a unit (SCREEN-OPS-017). Newest first. A
   * location-scoped staffer only sees blocks on units currently at one of their locations
   * (FR-RPT-004).
   */
  async listBlocks(
    actor: Actor,
    filter: { unitId?: string; status?: string; locationCode?: string } = {},
  ): Promise<BlockRow[]> {
    // same rule as the unit list: requested codes (CSV) validated against the actor's scope
    const scope = effectiveLocationCodes(actor, filter.locationCode);
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
      .select({ id: location.id, code: location.code, status: location.status })
      .from(location)
      .where(eq(location.code, input.toLocationCode))
      .limit(1);
    if (!dest) throw AppError.notFound(`location ${input.toLocationCode}`);
    assertLocationActive(dest.status, dest.code);
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
      .select({
        id: location.id,
        code: location.code,
        organizationId: location.organizationId,
        status: location.status,
      })
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
      else if (loc.status !== 'active')
        err('locationCode', `location "${rec.locationCode}" is archived`);
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
