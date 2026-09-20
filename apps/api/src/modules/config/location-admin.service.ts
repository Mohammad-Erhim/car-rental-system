import { createHash } from 'node:crypto';

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, gte, inArray, or, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import { assertLocationAccess } from '../../common/auth/location-scope';
import type { Actor } from '../../common/auth/types';
import { CacheBus } from '../../common/cache/cache-bus';
import { isUniqueViolation } from '../../common/db-error';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { product, vehicleCategory } from '../../database/schema/catalogue';
import { vehicleUnit } from '../../database/schema/fleet';
import { staffProfile } from '../../database/schema/iam';
import { location, locationHoursException, organization } from '../../database/schema/org';
import { ratePlan } from '../../database/schema/pricing';
import { rental } from '../../database/schema/rental';
import { reservation } from '../../database/schema/reservation';
import { WorkflowPublic } from '../workflow/workflow.public';

import { ConfigPublic } from './config.public';

/**
 * FR-ADM-007 / SCREEN-OPS-028 — location & operating-hours administration. Manage the fields
 * discovery already consumes (hours, after-hours, instructions, supported categories, turnaround)
 * plus holiday/closure exceptions. A location with history is **archived, never deleted**, and a
 * status change to a location with future reservations reports the impact and needs `force`.
 * Localized public content, one-way-route pricing, and the map-coordinate confirmation flow are
 * documented follow-ups.
 */
export interface HoursSlot {
  day: number;
  open?: string;
  close?: string;
  closed?: boolean;
}

export interface LocationInput {
  code: string;
  name: string;
  timezone: string;
  address?: Record<string, string>;
  contact?: Record<string, string>;
  latitude?: string | null;
  longitude?: string | null;
  regularHours?: HoursSlot[];
  afterHoursReturn?: boolean;
  pickupInstructions?: string | null;
  returnInstructions?: string | null;
  supportedCategoryCodes?: string[];
  turnaroundMinutes?: number;
  status?: 'draft' | 'active' | 'archived';
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A string Intl accepts as an IANA zone (`Intl.DateTimeFormat` throws a RangeError otherwise). */
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class LocationAdminService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly cache: CacheBus,
    private readonly config: ConfigPublic,
    private readonly workflows: WorkflowPublic,
  ) {}

  /** Retiring a location is an action an owner can put a pipeline in front of. */
  onModuleInit(): void {
    this.workflows.register<{ force?: boolean }>({
      key: 'location.archive',
      subjectType: 'location',
      label: 'Archive a location',
      description: 'Retire a branch so it no longer takes bookings (its history is kept).',
      variables: ['code'],
      fingerprint: async (code, tx) => {
        const [l] = await tx
          .select({ s: location.status, u: location.version })
          .from(location)
          .where(eq(location.code, code))
          .limit(1);
        return l
          ? createHash('sha256')
              .update(JSON.stringify([l.s, l.u]))
              .digest('hex')
          : null;
      },
      execute: async ({ subjectId, payload, instance, actors, audit }) => {
        const actor = this.workflows.asActor(actors, instance.organizationId, payload);
        await this.setStatusNow(actor, subjectId, 'archived', { force: payload.force });
        audit({
          action: 'config.location.archive_approved',
          targetType: 'location',
          targetId: subjectId,
          actor,
          after: { viaWorkflow: true },
        });
        return { archived: true };
      },
    });
  }

  /** Delegates to `ConfigPublic.defaultOrganization()` (deterministically ordered by
   *  `createdAt`) rather than repeating the raw, unordered `organization` query. */
  private async orgId(): Promise<string> {
    const org = await this.config.defaultOrganization();
    if (!org) throw new AppError('resource_not_found', { title: 'No organization configured' });
    return org.id;
  }

  /** FR-PAY invoices — the organization's legal identity. Read by `InvoiceService` at issuance
   *  time and shown here so an admin can see why invoicing might be silently paused. */
  async getLegalProfile() {
    const orgId = await this.orgId();
    const [org] = await this.db
      .select({
        legalName: organization.legalName,
        taxId: organization.taxId,
        registeredAddress: organization.registeredAddress,
        version: organization.version,
      })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);
    return org!;
  }

  async updateLegalProfile(
    actor: Actor,
    input: {
      legalName: string;
      taxId: string;
      registeredAddress: Record<string, string>;
    },
    expectedVersion?: number,
  ) {
    const orgId = await this.orgId();
    const [existing] = await this.db
      .select({ version: organization.version })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);
    if (!existing) throw AppError.notFound('organization');
    if (expectedVersion !== undefined && expectedVersion !== existing.version) {
      throw AppError.conflict(existing.version);
    }
    // guard the UPDATE itself on the loaded version so two concurrent saves can't both win
    // (the earlier compare above is TOCTOU on its own — this is the atomic check)
    const versionGuard =
      expectedVersion !== undefined
        ? and(eq(organization.id, orgId), eq(organization.version, expectedVersion))
        : eq(organization.id, orgId);
    const [updated] = await this.db
      .update(organization)
      .set({
        legalName: input.legalName,
        taxId: input.taxId,
        registeredAddress: input.registeredAddress,
        version: sql`${organization.version} + 1`,
        updatedAt: sql`now()`,
        updatedBy: actor.accountId,
      })
      .where(versionGuard)
      .returning();
    if (!updated) {
      const [current] = await this.db
        .select({ version: organization.version })
        .from(organization)
        .where(eq(organization.id, orgId))
        .limit(1);
      throw AppError.conflict(current?.version ?? existing.version);
    }
    await this.audit.record({
      action: 'organization.legal_profile.updated',
      targetType: 'organization',
      targetId: orgId,
      actor,
      after: input,
    });
    return this.getLegalProfile();
  }

  /** Every location incl. draft/archived, for the ops editor. */
  /** Every location of the organisation; a location-scoped actor only sees their own branches. */
  async list(actor?: Actor) {
    const org = await this.orgId();
    const rows = await this.db
      .select()
      .from(location)
      .where(eq(location.organizationId, org))
      .orderBy(asc(location.name));
    const scope = actor?.locationScope?.length ? actor.locationScope : null;
    return rows.filter((r) => !scope || scope.includes(r.code)).map((r) => this.shape(r));
  }

  /**
   * The locations the caller may pick from in a filter or a form — active AND archived (an
   * archived branch still owns history), narrowed to the actor's own scope. Unlike the public
   * `/config/locations`, this reflects the actor's scope as of THIS request, so a scope change
   * made by an admin takes effect in the UI without waiting for the next sign-in refresh.
   */
  async options(actor: Actor) {
    const org = await this.orgId();
    const scope = actor.locationScope?.length ? actor.locationScope : null;
    const rows = await this.db
      .select({
        id: location.id,
        code: location.code,
        name: location.name,
        status: location.status,
        timezone: location.timezone,
      })
      .from(location)
      .where(eq(location.organizationId, org))
      .orderBy(asc(location.name));
    return {
      restricted: scope !== null,
      options: rows.filter((r) => !scope || scope.includes(r.code)),
    };
  }

  async get(code: string, actor?: Actor) {
    if (actor) assertLocationAccess(actor, code);
    const row = await this.load(code);
    const exceptions = await this.db
      .select()
      .from(locationHoursException)
      .where(eq(locationHoursException.locationId, row.id))
      .orderBy(asc(locationHoursException.date));
    return {
      ...this.shape(row),
      hoursExceptions: exceptions.map((e) => ({
        id: e.id,
        date: e.date,
        closed: e.closed,
        open: e.open,
        close: e.close,
        reason: e.reason,
      })),
    };
  }

  /**
   * Impact of retiring a location — anything still tied to it: an upcoming reservation picking up
   * or returning here, plus a car from an open rental scheduled to come back here (its pickup is
   * already in the past, so the reservation-date filter alone would miss it). FR-ADM-007.
   */
  async impact(code: string) {
    const row = await this.load(code);
    const now = new Date().toISOString();
    const [res] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(reservation)
      .where(
        and(
          eq(reservation.organizationId, row.organizationId),
          inArray(reservation.state, ['pending', 'confirmed']),
          or(gte(reservation.pickupAt, now), gte(reservation.returnAt, now)),
          or(eq(reservation.pickupLocationCode, code), eq(reservation.returnLocationCode, code)),
        ),
      );
    const [rent] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(rental)
      .where(
        and(
          eq(rental.organizationId, row.organizationId),
          inArray(rental.state, ['awaiting_pickup', 'active', 'overdue']),
          or(eq(rental.pickupLocationCode, code), eq(rental.returnLocationCode, code)),
        ),
      );
    // cars parked here, staff whose access is limited to it, and pricing/catalogue entries that
    // only apply here would all be stranded (invisible in every filter) by archiving it
    const [units] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(vehicleUnit)
      .where(
        and(eq(vehicleUnit.currentLocationId, row.id), sql`${vehicleUnit.state} <> 'retired'`),
      );
    const [staff] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(staffProfile)
      .where(
        and(
          sql`${staffProfile.locationScope} ? ${code}`,
          inArray(staffProfile.status, ['active', 'invited']),
        ),
      );
    const [plans] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(ratePlan)
      .where(
        and(
          eq(ratePlan.organizationId, row.organizationId),
          eq(ratePlan.locationCode, code),
          sql`${ratePlan.status} <> 'retired'`,
        ),
      );
    const [products] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(product)
      .where(
        and(
          eq(product.organizationId, row.organizationId),
          eq(product.active, true),
          sql`${product.locationScope} ? ${code}`,
        ),
      );
    return {
      code,
      futureReservations: res?.n ?? 0,
      openRentals: rent?.n ?? 0,
      units: units?.n ?? 0,
      staff: staff?.n ?? 0,
      ratePlans: plans?.n ?? 0,
      products: products?.n ?? 0,
    };
  }

  /** anything that would be stranded by retiring this location. */
  private impactTotal(i: {
    futureReservations: number;
    openRentals: number;
    units: number;
    staff: number;
    ratePlans: number;
    products: number;
  }): number {
    return i.futureReservations + i.openRentals + i.units + i.staff + i.ratePlans + i.products;
  }

  async upsert(actor: Actor, input: LocationInput) {
    const org = await this.orgId();
    await this.validate(org, input);
    // Archival is only reachable through `setStatus`, which runs the future-reservation impact
    // check — `upsert` must not be a back door around it.
    if (input.status === 'archived') {
      throw AppError.businessRule('Use the archive action to retire a location', {
        reason: 'archive_via_action',
      });
    }
    const [existing] = await this.db
      .select()
      .from(location)
      .where(and(eq(location.organizationId, org), eq(location.code, input.code)))
      .limit(1);
    if (existing?.status === 'archived' && input.status !== 'active') {
      throw AppError.businessRule('Restore this location before editing it', {
        reason: 'location_archived',
      });
    }

    const values = {
      name: input.name,
      timezone: input.timezone,
      address: input.address ?? existing?.address ?? {},
      contact: input.contact ?? existing?.contact ?? {},
      latitude: input.latitude ?? existing?.latitude ?? null,
      longitude: input.longitude ?? existing?.longitude ?? null,
      regularHours: input.regularHours ?? existing?.regularHours ?? [],
      afterHoursReturn: input.afterHoursReturn ?? existing?.afterHoursReturn ?? false,
      pickupInstructions: input.pickupInstructions ?? existing?.pickupInstructions ?? null,
      returnInstructions: input.returnInstructions ?? existing?.returnInstructions ?? null,
      supportedCategoryCodes:
        input.supportedCategoryCodes ?? existing?.supportedCategoryCodes ?? [],
      turnaroundMinutes: input.turnaroundMinutes ?? existing?.turnaroundMinutes ?? 60,
      status: input.status ?? existing?.status ?? 'active',
    };

    let row;
    try {
      [row] = existing
        ? await this.db
            .update(location)
            .set({ ...values, updatedBy: actor.accountId, updatedAt: new Date().toISOString() })
            .where(eq(location.id, existing.id))
            .returning()
        : await this.db
            .insert(location)
            .values({
              organizationId: org,
              code: input.code,
              createdBy: actor.accountId,
              ...values,
            })
            .returning();
    } catch (err) {
      // two admins creating the same code at once — the unique index caught the loser.
      if (isUniqueViolation(err)) {
        throw new AppError('state_conflict', {
          title: `A location with code ${input.code} already exists`,
          params: { reason: 'code_exists' },
        });
      }
      throw err;
    }

    await this.after(
      actor,
      existing ? 'config.location.updated' : 'config.location.created',
      row!.id,
      {
        code: input.code,
        before: existing ? { status: existing.status, name: existing.name } : undefined,
      },
    );
    return this.shape(row!);
  }

  async setStatus(
    actor: Actor,
    code: string,
    status: 'active' | 'archived',
    opts: { force?: boolean } = {},
  ) {
    if (status === 'archived') {
      const row = await this.load(code);
      if (row.status !== 'archived') {
        // refuse what would fail anyway before anyone is asked to approve it
        await this.assertArchivable(code, opts.force);
        return this.workflows.govern(
          {
            actionKey: 'location.archive',
            subjectId: code,
            subjectLabel: `Archive location ${code}`,
            payload: { force: !!opts.force },
            context: { code },
            locationCode: code,
            actor,
          },
          () => this.setStatusNow(actor, code, status, opts),
        );
      }
    }
    return this.setStatusNow(actor, code, status, opts);
  }

  private async assertArchivable(code: string, force?: boolean) {
    if (force) return;
    const impact = await this.impact(code);
    if (this.impactTotal(impact) > 0) {
      throw AppError.businessRule(
        'This location still has upcoming reservations, cars, staff or pricing tied to it — confirm to archive it',
        {
          reason: 'location_has_future_reservations',
          futureReservations: impact.futureReservations,
          openRentals: impact.openRentals,
          units: impact.units,
          staff: impact.staff,
          ratePlans: impact.ratePlans,
          products: impact.products,
        },
      );
    }
  }

  private async setStatusNow(
    actor: Actor,
    code: string,
    status: 'active' | 'archived',
    opts: { force?: boolean } = {},
  ) {
    const row = await this.load(code);
    if (status === 'archived' && !opts.force) {
      const impact = await this.impact(code);
      if (this.impactTotal(impact) > 0) {
        throw AppError.businessRule(
          'This location still has upcoming reservations, cars, staff or pricing tied to it — confirm to archive it',
          {
            reason: 'location_has_future_reservations',
            futureReservations: impact.futureReservations,
            openRentals: impact.openRentals,
            units: impact.units,
            staff: impact.staff,
            ratePlans: impact.ratePlans,
            products: impact.products,
          },
        );
      }
    }
    const [updated] = await this.db
      .update(location)
      .set({ status, updatedBy: actor.accountId, updatedAt: new Date().toISOString() })
      .where(eq(location.id, row.id))
      .returning();
    await this.after(
      actor,
      status === 'archived' ? 'config.location.archived' : 'config.location.restored',
      row.id,
      {
        code,
      },
    );
    return this.shape(updated!);
  }

  async addException(
    actor: Actor,
    code: string,
    input: {
      date: string;
      closed?: boolean;
      open?: string | null;
      close?: string | null;
      reason?: string;
    },
  ) {
    const row = await this.load(code);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      throw AppError.validation([{ path: 'date', code: 'invalid_string' }]);
    }
    const closed = input.closed ?? !(input.open && input.close);
    if (!closed) {
      if (!input.open || !input.close || !TIME_RE.test(input.open) || !TIME_RE.test(input.close)) {
        throw AppError.validation([{ path: 'open', code: 'required' }]);
      }
      if (input.open >= input.close) {
        throw AppError.businessRule(
          'The exception’s opening time must be before its closing time',
          {
            reason: 'hours_inverted',
          },
        );
      }
    }
    let ex;
    try {
      [ex] = await this.db
        .insert(locationHoursException)
        .values({
          locationId: row.id,
          date: input.date,
          closed,
          open: closed ? null : (input.open ?? null),
          close: closed ? null : (input.close ?? null),
          reason: input.reason ?? null,
          createdBy: actor.accountId,
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('state_conflict', {
          title: `${code} already has an hours exception for ${input.date} — remove it first`,
          params: { reason: 'exception_exists', date: input.date },
        });
      }
      throw err;
    }
    await this.after(actor, 'config.location.hours_exception.added', row.id, {
      code,
      date: input.date,
    });
    return {
      id: ex!.id,
      date: ex!.date,
      closed: ex!.closed,
      open: ex!.open,
      close: ex!.close,
      reason: ex!.reason,
    };
  }

  async removeException(actor: Actor, code: string, exceptionId: string) {
    const row = await this.load(code);
    const [deleted] = await this.db
      .delete(locationHoursException)
      .where(
        and(
          eq(locationHoursException.id, exceptionId),
          eq(locationHoursException.locationId, row.id),
        ),
      )
      .returning();
    if (!deleted) throw AppError.notFound('hours exception');
    await this.after(actor, 'config.location.hours_exception.removed', row.id, { code });
    return { removed: true };
  }

  // ---- internals ----

  private async load(code: string) {
    const org = await this.orgId();
    const [row] = await this.db
      .select()
      .from(location)
      .where(and(eq(location.organizationId, org), eq(location.code, code)))
      .limit(1);
    if (!row) throw AppError.notFound('location');
    return row;
  }

  private async validate(orgId: string, input: LocationInput) {
    const issues: Array<{ path: string; code: string }> = [];

    if (input.timezone && !isValidTimeZone(input.timezone)) {
      issues.push({ path: 'timezone', code: 'invalid_timezone' });
    }

    const seenDays = new Set<number>();
    for (const [i, s] of (input.regularHours ?? []).entries()) {
      if (s.day < 0 || s.day > 6) {
        issues.push({ path: `regularHours.${i}.day`, code: 'invalid_type' });
        continue;
      }
      if (seenDays.has(s.day)) {
        issues.push({ path: `regularHours.${i}.day`, code: 'duplicate' });
      }
      seenDays.add(s.day);
      if (!s.closed) {
        if (!s.open || !s.close || !TIME_RE.test(s.open) || !TIME_RE.test(s.close)) {
          issues.push({ path: `regularHours.${i}.open`, code: 'invalid_string' });
        } else if (s.open >= s.close) {
          throw AppError.businessRule('A location’s opening time must be before its closing time', {
            reason: 'hours_inverted',
            day: s.day,
          });
        }
      }
    }

    if (
      input.turnaroundMinutes != null &&
      (input.turnaroundMinutes < 0 || input.turnaroundMinutes > 1440)
    ) {
      issues.push({ path: 'turnaroundMinutes', code: 'out_of_range' });
    }

    for (const [field, limit] of [
      ['latitude', 90],
      ['longitude', 180],
    ] as const) {
      const raw = input[field];
      if (raw == null || raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || Math.abs(n) > limit) {
        issues.push({ path: field, code: 'out_of_range' });
      }
    }

    // supported categories must be codes of active vehicle categories, not free text
    const codes = input.supportedCategoryCodes ?? [];
    if (codes.length) {
      const active = await this.db
        .select({ code: vehicleCategory.code })
        .from(vehicleCategory)
        .where(and(eq(vehicleCategory.organizationId, orgId), eq(vehicleCategory.isActive, true)));
      const activeSet = new Set(active.map((c) => c.code));
      codes.forEach((c, i) => {
        if (!activeSet.has(c)) {
          issues.push({ path: `supportedCategoryCodes.${i}`, code: 'unsupported' });
        }
      });
    }

    if (issues.length) throw AppError.validation(issues, 'Location details are not valid');
  }

  private async after(
    actor: Actor,
    action: string,
    targetId: string,
    detail: Record<string, unknown>,
  ) {
    await this.audit.record({ action, targetType: 'location', targetId, actor, after: detail });
    await this.outbox.emit({
      type: 'lookup.invalidated.v1',
      aggregateType: 'location',
      aggregateId: targetId,
      payload: { scope: 'location', action },
    });
    await this.cache.invalidate('config:locations', { action });
  }

  private shape(r: typeof location.$inferSelect) {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      timezone: r.timezone,
      address: r.address,
      contact: r.contact,
      latitude: r.latitude,
      longitude: r.longitude,
      regularHours: r.regularHours,
      afterHoursReturn: r.afterHoursReturn,
      pickupInstructions: r.pickupInstructions,
      returnInstructions: r.returnInstructions,
      supportedCategoryCodes: r.supportedCategoryCodes,
      turnaroundMinutes: r.turnaroundMinutes,
      status: r.status,
    };
  }
}
