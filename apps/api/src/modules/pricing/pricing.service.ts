import { createHash } from 'node:crypto';

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { organization } from '../../database/schema/org';
import { quote, quoteLine, ratePlan, rateTier } from '../../database/schema/pricing';
import { CatalogueService } from '../catalogue/catalogue.service';
import { ConfigPublic } from '../config/config.public';
import { WorkflowPublic } from '../workflow/workflow.public';

import { computeQuote, isQuoteError, type QuoteComputation } from './quote.calculator';

const QUOTE_TTL_MS = 20 * 60 * 1000; // 20 minutes

export interface PricedQuote {
  computation: QuoteComputation;
  ratePlanId: string;
  ratePlanVersion: number;
  currency: string;
}

// ARCH-GAP (2026-09-15 audit, finding #3): `pricing` has no pricing.public.ts facade, even though
// CLAUDE.md names `pricing` as its own worked example of a sub-domain folded into a parent module
// that "must still expose its cross-module surface through the parent's .public.ts". In practice
// PricingService is imported directly, top-level, by booking/reservation-ops.service.ts,
// booking/booking.service.ts, rental/rental.service.ts, availability/availability.service.ts, and
// discovery's own controllers — the busiest of the five ungoverned sub-domains. The
// `apiModuleBoundaries` ESLint rule only blocks imports into a *subdirectory* of another module,
// not a top-level service file like this one, so this currently lints clean despite violating the
// documented convention. Left as-is rather than a partial migration for the same reason as the
// sibling note on fleet.service.ts: a real fix spans fleet, pricing, catalogue, availability, and
// discovery together (~15 call sites) and deserves a dedicated PR with its own DI-wiring
// verification. Follow-up: add pricing.public.ts (+ the other four) re-exporting only what's
// actually consumed cross-module, then migrate every call site listed above in one pass.
@Injectable()
export class PricingService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly catalogue: CatalogueService,
    private readonly config: ConfigPublic,
    private readonly workflows: WorkflowPublic,
  ) {}

  /** Publishing a rate plan is an action an owner can put a pipeline in front of. */
  onModuleInit(): void {
    this.workflows.register({
      key: 'rateplan.publish',
      subjectType: 'rate_plan',
      label: 'Publish a rate plan',
      description:
        'Make a drafted rate plan (its prices and tiers) live for a category and location.',
      variables: ['category', 'locationCode', 'name'],
      fingerprint: async (id, tx) => {
        const [p] = await tx.select().from(ratePlan).where(eq(ratePlan.id, id)).limit(1);
        if (!p) return null;
        const tiers = await tx.select().from(rateTier).where(eq(rateTier.ratePlanId, id));
        const { status: _s, updatedAt: _u, version: _v, updatedBy: _b, ...content } = p;
        void [_s, _u, _v, _b];
        return createHash('sha256')
          .update(JSON.stringify([content, tiers.map(({ updatedAt: _t, ...t }) => t)]))
          .digest('hex');
      },
      subjectOwner: async (id, tx) => {
        const [p] = await tx
          .select({ by: ratePlan.createdBy })
          .from(ratePlan)
          .where(eq(ratePlan.id, id))
          .limit(1);
        return p?.by ? { accountId: p.by } : null;
      },
      onCaptured: async ({ tx, subjectId }) => {
        await tx
          .update(ratePlan)
          .set({ status: 'in_review', updatedAt: sql`now()` })
          .where(and(eq(ratePlan.id, subjectId), eq(ratePlan.status, 'draft')));
      },
      execute: async ({ subjectId, payload, instance, actors, audit }) => {
        const actor = this.workflows.asActor(actors, instance.organizationId, payload);
        await this.publishPlanNow(actor, subjectId);
        audit({
          action: 'pricing.rate_plan.approved',
          targetType: 'rate_plan',
          targetId: subjectId,
          actor,
          after: { viaWorkflow: true },
        });
        return { published: true };
      },
      onClosed: async ({ tx, subjectId, reason, audit }) => {
        await tx
          .update(ratePlan)
          .set({ status: 'draft', updatedAt: sql`now()` })
          .where(and(eq(ratePlan.id, subjectId), eq(ratePlan.status, 'in_review')));
        audit({
          action: `pricing.rate_plan.${reason}`,
          targetType: 'rate_plan',
          targetId: subjectId,
        });
      },
    });
  }

  private async orgId(): Promise<string> {
    const [org] = await this.db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) throw new AppError('resource_not_found', { title: 'No organization configured' });
    return org.id;
  }

  /** The published rate plan that applies to a category + location for a pickup date (local YMD). */
  async applicablePlan(categoryCode: string, locationCode: string, pickupYmd: string) {
    const orgId = await this.orgId();
    const rows = await this.db
      .select()
      .from(ratePlan)
      .where(
        and(
          eq(ratePlan.organizationId, orgId),
          eq(ratePlan.categoryCode, categoryCode),
          eq(ratePlan.status, 'published'),
          or(isNull(ratePlan.locationCode), eq(ratePlan.locationCode, locationCode)),
          sql`${ratePlan.effectiveFrom} <= ${pickupYmd}`,
          or(isNull(ratePlan.effectiveTo), sql`${ratePlan.effectiveTo} >= ${pickupYmd}`),
        ),
      );
    if (!rows.length) return null;
    // most specific (location-scoped) then latest effectiveFrom wins
    rows.sort((a, b) => {
      const spec = (b.locationCode ? 1 : 0) - (a.locationCode ? 1 : 0);
      if (spec) return spec;
      return a.effectiveFrom < b.effectiveFrom ? 1 : -1;
    });
    const plan = rows[0]!;
    const tiers = await this.db.select().from(rateTier).where(eq(rateTier.ratePlanId, plan.id));
    return { plan, tiers };
  }

  /** Price a window; returns null if no plan applies, throws AppError on a rule violation. */
  async priceWindow(
    categoryCode: string,
    locationCode: string,
    pickupAt: Date,
    returnAt: Date,
    pickupYmd: string,
  ): Promise<PricedQuote | null> {
    const applicable = await this.applicablePlan(categoryCode, locationCode, pickupYmd);
    if (!applicable) return null;
    const { plan, tiers } = applicable;
    const result = computeQuote(
      pickupAt.getTime(),
      returnAt.getTime(),
      {
        id: plan.id,
        version: plan.publishedVersion,
        currency: plan.currency,
        baseDayMinor: plan.baseDayMinor,
        hourMinor: plan.hourMinor,
        minDurationHours: plan.minDurationHours,
        maxDurationHours: plan.maxDurationHours,
        fees: plan.fees,
        taxBps: plan.taxBps,
      },
      tiers.map((t) => ({ minHours: t.minHours, dayMinor: t.dayMinor })),
    );
    if (isQuoteError(result)) {
      if (result.reason === 'below_min_duration') {
        throw AppError.businessRule('Rental is shorter than the minimum for this rate', {
          reason: 'below_min_duration',
          minHours: result.minDurationHours,
        });
      }
      if (result.reason === 'above_max_duration') {
        throw AppError.businessRule('Rental is longer than the maximum for this rate', {
          reason: 'above_max_duration',
          maxHours: result.maxDurationHours,
        });
      }
      throw AppError.businessRule('Invalid rental window', { reason: 'invalid_window' });
    }
    return {
      computation: result,
      ratePlanId: plan.id,
      ratePlanVersion: plan.publishedVersion,
      currency: plan.currency,
    };
  }

  /** Persist a new quote (version 1) or a superseding version for an existing reference. */
  async persistQuote(
    actor: Actor | null,
    input: {
      reference?: string;
      categoryCode: string;
      pickupLocationCode: string;
      returnLocationCode: string;
      pickupAt: Date;
      returnAt: Date;
      priced: PricedQuote;
      holdId?: string | null;
    },
  ) {
    const orgId = await this.orgId();
    const reference =
      input.reference ??
      `Q-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 46656)
        .toString(36)
        .toUpperCase()
        .padStart(3, '0')}`;

    let version = 1;
    if (input.reference) {
      const prev = await this.db
        .select({ v: quote.version })
        .from(quote)
        .where(eq(quote.reference, input.reference))
        .orderBy(sql`${quote.version} desc`)
        .limit(1);
      if (prev[0]) {
        version = prev[0].v + 1;
        await this.db
          .update(quote)
          .set({ status: 'superseded', updatedAt: sql`now()` })
          .where(and(eq(quote.reference, input.reference), eq(quote.status, 'active')));
      }
    }

    const c = input.priced.computation;
    const [row] = await this.db
      .insert(quote)
      .values({
        organizationId: orgId,
        reference,
        version,
        status: 'active',
        categoryCode: input.categoryCode,
        pickupLocationCode: input.pickupLocationCode,
        returnLocationCode: input.returnLocationCode,
        pickupAt: input.pickupAt.toISOString(),
        returnAt: input.returnAt.toISOString(),
        durationHours: c.durationHours,
        currency: input.priced.currency,
        ratePlanId: input.priced.ratePlanId,
        ratePlanVersion: input.priced.ratePlanVersion,
        subtotalMinor: c.subtotalMinor,
        taxMinor: c.taxMinor,
        totalMinor: c.totalMinor,
        expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
        holdId: input.holdId ?? null,
        createdBy: actor?.accountId ?? null,
      })
      .returning();

    await this.db.insert(quoteLine).values(
      c.lines.map((l) => ({
        quoteId: row!.id,
        kind: l.kind,
        code: l.code,
        label: l.label,
        quantity: l.quantity,
        unitMinor: l.unitMinor,
        amountMinor: l.amountMinor,
        taxable: l.taxable,
        sortOrder: l.sortOrder,
      })),
    );

    await this.audit.record({
      action: 'pricing.quote.issued',
      targetType: 'quote',
      targetId: row!.id,
      actor: actor ?? undefined,
      after: { reference, version, totalMinor: c.totalMinor, currency: input.priced.currency },
    });

    return this.getQuote(reference);
  }

  async getQuote(reference: string) {
    const [q] = await this.db
      .select()
      .from(quote)
      .where(eq(quote.reference, reference))
      .orderBy(sql`${quote.version} desc`)
      .limit(1);
    if (!q) throw AppError.notFound('quote');
    const lines = await this.db
      .select()
      .from(quoteLine)
      .where(eq(quoteLine.quoteId, q.id))
      .orderBy(asc(quoteLine.sortOrder));
    const expired = new Date(q.expiresAt).getTime() < Date.now();
    return {
      reference: q.reference,
      version: q.version,
      status: (expired && q.status === 'active' ? 'expired' : q.status) as
        | 'active'
        | 'superseded'
        | 'expired'
        | 'consumed',
      categoryCode: q.categoryCode,
      pickupLocationCode: q.pickupLocationCode,
      returnLocationCode: q.returnLocationCode,
      pickupAt: new Date(q.pickupAt).toISOString(),
      returnAt: new Date(q.returnAt).toISOString(),
      durationHours: q.durationHours,
      currency: q.currency,
      lines: lines.map((l) => ({
        kind: l.kind as 'time' | 'fee' | 'surcharge' | 'discount' | 'tax',
        code: l.code,
        label: l.label,
        quantity: l.quantity,
        unitMinor: l.unitMinor,
        amountMinor: l.amountMinor,
      })),
      subtotalMinor: q.subtotalMinor,
      taxMinor: q.taxMinor,
      totalMinor: q.totalMinor,
      expiresAt: new Date(q.expiresAt).toISOString(),
      holdId: q.holdId,
    };
  }

  // ---- rate plan management (SCREEN-OPS-025/026) ----

  /**
   * A location-scoped actor may create / edit / publish / delete only plans pinned to one of
   * their own locations. An organisation-wide plan (`locationCode` null) prices every branch, so
   * changing it needs an account that isn't limited to specific locations.
   */
  private assertPlanWritable(actor: Actor, planLocation: string | null | undefined): void {
    const scope = actor.locationScope?.length ? actor.locationScope : null;
    if (!scope) return;
    if (!planLocation) {
      throw AppError.forbidden(
        'This rate plan applies to every location, so it needs an account that is not limited to specific locations',
      );
    }
    if (!scope.includes(planLocation)) {
      throw AppError.forbidden(`You don't have access to location "${planLocation}"`);
    }
  }

  /**
   * A location-scoped actor sees the plans that price THEIR branches: their own location's plans
   * and the organisation-wide ones (`locationCode` null) — the latter read-only, see
   * `assertPlanWritable`. An org-wide actor sees everything.
   */
  async listPlans(actor?: Actor) {
    const orgId = await this.orgId();
    const scope = actor?.locationScope?.length ? actor.locationScope : null;
    const all = await this.db
      .select()
      .from(ratePlan)
      .where(eq(ratePlan.organizationId, orgId))
      .orderBy(asc(ratePlan.categoryCode), asc(ratePlan.effectiveFrom));
    const plans = all.filter((p) => !scope || !p.locationCode || scope.includes(p.locationCode));
    if (!plans.length) return [];
    const tiers = await this.db
      .select()
      .from(rateTier)
      .where(
        inArray(
          rateTier.ratePlanId,
          plans.map((p) => p.id),
        ),
      )
      .orderBy(asc(rateTier.minHours));
    return plans.map((p) => ({
      ...p,
      tiers: tiers
        .filter((t) => t.ratePlanId === p.id)
        .map((t) => ({ minHours: t.minHours, dayMinor: t.dayMinor })),
    }));
  }

  async upsertPlan(
    actor: Actor,
    input: {
      id?: string;
      categoryCode: string;
      locationCode?: string | null;
      currency?: string;
      name: string;
      effectiveFrom: string;
      effectiveTo?: string | null;
      baseDayMinor: number;
      hourMinor?: number;
      minDurationHours?: number;
      maxDurationHours?: number | null;
      taxBps?: number;
      fees?: Array<{ code: string; label: string; amountMinor: number; taxable?: boolean }>;
      tiers?: Array<{ minHours: number; dayMinor: number }>;
    },
    expectedVersion?: number,
  ) {
    const orgId = await this.orgId();
    this.validatePlan(input);
    await this.assertScope(input);
    this.assertPlanWritable(actor, input.locationCode);
    const values = {
      organizationId: orgId,
      categoryCode: input.categoryCode,
      locationCode: input.locationCode ?? null,
      currency: input.currency ?? 'USD',
      name: input.name,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      baseDayMinor: input.baseDayMinor,
      hourMinor: input.hourMinor ?? 0,
      minDurationHours: input.minDurationHours ?? 24,
      maxDurationHours: input.maxDurationHours ?? null,
      taxBps: input.taxBps ?? 0,
      fees: input.fees ?? [],
    };
    let id = input.id;
    if (id) {
      const [existing] = await this.db.select().from(ratePlan).where(eq(ratePlan.id, id)).limit(1);
      if (!existing) throw AppError.notFound('rate plan');
      this.assertPlanWritable(actor, existing.locationCode);
      if (existing.status === 'published' || existing.status === 'retired') {
        throw AppError.businessRule(
          `A ${existing.status} rate plan cannot be edited — clone it into a new draft`,
          { reason: 'plan_immutable' },
        );
      }
      if (expectedVersion !== undefined && expectedVersion !== existing.version) {
        throw AppError.conflict(existing.version, existing.status);
      }
      await this.db
        .update(ratePlan)
        .set({
          ...values,
          version: existing.version + 1,
          updatedAt: sql`now()`,
          updatedBy: actor.accountId,
        })
        .where(eq(ratePlan.id, id));
    } else {
      const [row] = await this.db
        .insert(ratePlan)
        .values({ ...values, status: 'draft', createdBy: actor.accountId })
        .returning({ id: ratePlan.id });
      id = row!.id;
    }
    if (input.tiers) {
      await this.db.delete(rateTier).where(eq(rateTier.ratePlanId, id));
      if (input.tiers.length) {
        await this.db.insert(rateTier).values(
          input.tiers.map((t) => ({
            ratePlanId: id!,
            minHours: t.minHours,
            dayMinor: t.dayMinor,
          })),
        );
      }
    }
    await this.audit.record({
      action: input.id ? 'pricing.rate_plan.updated' : 'pricing.rate_plan.created',
      targetType: 'rate_plan',
      targetId: id,
      actor,
      after: { name: values.name, category: values.categoryCode },
    });
    return this.db.select().from(ratePlan).where(eq(ratePlan.id, id)).limit(1);
  }

  /**
   * A rate plan only ever prices a rental if its category / location / currency line up with a
   * real catalogue entry — validate that at write time so a typo fails loudly instead of
   * producing a plan that silently never applies.
   */
  private async assertScope(input: {
    categoryCode: string;
    locationCode?: string | null;
    currency?: string;
  }) {
    const issues: Array<{ path: string; code: string }> = [];

    const cats = await this.catalogue.listCategories({});
    if (!cats.some((c) => c.code === input.categoryCode)) {
      issues.push({ path: 'categoryCode', code: 'unsupported' });
    }
    if (input.locationCode) {
      const orgId = await this.orgId();
      const locs = await this.config.listLocations(orgId);
      if (!locs.some((l) => l.code === input.locationCode)) {
        issues.push({ path: 'locationCode', code: 'unsupported' });
      }
    }
    if (issues.length) throw AppError.validation(issues, 'Rate plan scope is not valid');

    if (input.currency) {
      // `currency` is a constrained reference-data set (ISO-4217 subset)
      await this.config.assertLookupCode('currency', input.currency, 'currency');
    }
  }

  private validatePlan(input: {
    baseDayMinor: number;
    hourMinor?: number;
    minDurationHours?: number;
    maxDurationHours?: number | null;
    taxBps?: number;
    fees?: Array<{ code: string; label: string; amountMinor: number }>;
    tiers?: Array<{ minHours: number; dayMinor: number }>;
    effectiveFrom: string;
    effectiveTo?: string | null;
  }) {
    const issues: Array<{ path: string; code: string }> = [];
    if (input.baseDayMinor <= 0) issues.push({ path: 'baseDayMinor', code: 'must_be_positive' });
    if ((input.hourMinor ?? 0) < 0) issues.push({ path: 'hourMinor', code: 'must_be_positive' });
    if ((input.taxBps ?? 0) < 0 || (input.taxBps ?? 0) > 10_000)
      issues.push({ path: 'taxBps', code: 'out_of_range' });
    if ((input.minDurationHours ?? 1) < 1)
      issues.push({ path: 'minDurationHours', code: 'must_be_positive' });
    if (
      input.minDurationHours != null &&
      input.maxDurationHours != null &&
      input.minDurationHours > input.maxDurationHours
    )
      issues.push({ path: 'maxDurationHours', code: 'less_than_min' });
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom)
      issues.push({ path: 'effectiveTo', code: 'before_from' });
    const feeCodes = new Set<string>();
    for (const [i, f] of (input.fees ?? []).entries()) {
      if (!f.code.trim() || !f.label.trim()) issues.push({ path: `fees.${i}`, code: 'incomplete' });
      if (f.amountMinor < 0) issues.push({ path: `fees.${i}`, code: 'must_be_positive' });
      if (f.code.trim() && feeCodes.has(f.code.trim()))
        issues.push({ path: `fees.${i}`, code: 'duplicate' });
      feeCodes.add(f.code.trim());
    }
    const tierMins = new Set<number>();
    for (const [i, tr] of (input.tiers ?? []).entries()) {
      if (tr.minHours <= 0 || tr.dayMinor <= 0)
        issues.push({ path: `tiers.${i}`, code: 'must_be_positive' });
      if (tierMins.has(tr.minHours)) issues.push({ path: `tiers.${i}`, code: 'duplicate' });
      tierMins.add(tr.minHours);
    }
    if (issues.length) throw AppError.validation(issues, 'Rate plan is not valid');
  }

  /** Published plans for the same scope whose effective range overlaps `plan` (open ends = ±∞). */
  private async overlappingPublished(plan: typeof ratePlan.$inferSelect) {
    const FAR = '9999-12-31';
    return this.db
      .select()
      .from(ratePlan)
      .where(
        and(
          eq(ratePlan.organizationId, plan.organizationId),
          eq(ratePlan.categoryCode, plan.categoryCode),
          plan.locationCode
            ? eq(ratePlan.locationCode, plan.locationCode)
            : isNull(ratePlan.locationCode),
          eq(ratePlan.status, 'published'),
          sql`${ratePlan.id} <> ${plan.id}`,
          // A.from ≤ B.to  AND  B.from ≤ A.to
          sql`${ratePlan.effectiveFrom} <= ${plan.effectiveTo ?? FAR}`,
          sql`${plan.effectiveFrom} <= coalesce(${ratePlan.effectiveTo}, ${FAR})`,
        ),
      );
  }

  async publishPlan(actor: Actor, id: string) {
    const [existing] = await this.db.select().from(ratePlan).where(eq(ratePlan.id, id)).limit(1);
    if (!existing) throw AppError.notFound('rate plan');
    this.assertPlanWritable(actor, existing.locationCode);
    if (existing.status === 'published') return existing;
    if (existing.status === 'retired') {
      throw AppError.businessRule('A retired rate plan cannot be published — clone it', {
        reason: 'retired_immutable',
      });
    }
    this.validatePlan(existing);
    await this.assertScope(existing);

    // someone asked to approve an open request approves it, rather than starting another
    const acted = await this.workflows.actOnOpen({
      actor,
      actionKey: 'rateplan.publish',
      subjectId: id,
      decision: 'approve',
      strict: false,
    });
    if (acted) return { pendingApproval: true as const, workflow: acted, existing: true };
    return this.workflows.govern(
      {
        actionKey: 'rateplan.publish',
        subjectId: id,
        subjectLabel: `Rate plan · ${existing.name}`,
        context: {
          category: existing.categoryCode,
          locationCode: existing.locationCode,
          name: existing.name,
        },
        locationCode: existing.locationCode ?? undefined,
        actor,
      },
      () => this.publishPlanNow(actor, id),
    );
  }

  /** The publish itself (validation and scope were checked when it was requested and are checked again here). */
  async publishPlanNow(actor: Actor, id: string) {
    const [existing] = await this.db.select().from(ratePlan).where(eq(ratePlan.id, id)).limit(1);
    if (!existing) throw AppError.notFound('rate plan');
    this.assertPlanWritable(actor, existing.locationCode);
    if (existing.status === 'published') return existing;
    if (existing.status === 'retired') {
      throw AppError.businessRule('A retired rate plan cannot be published — clone it', {
        reason: 'retired_immutable',
      });
    }
    this.validatePlan(existing);
    await this.assertScope(existing);

    // only supersede published plans this one actually overlaps in time — a future/seasonal plan
    // for the same scope keeps its own window.
    const superseded = await this.overlappingPublished(existing);

    await this.db
      .update(ratePlan)
      .set({
        status: 'published',
        publishedVersion: existing.publishedVersion + 1,
        publishedAt: sql`now()`,
        publishedBy: actor.accountId,
        version: existing.version + 1,
        updatedAt: sql`now()`,
      })
      .where(eq(ratePlan.id, id));
    if (superseded.length) {
      await this.db
        .update(ratePlan)
        .set({ status: 'retired', updatedAt: sql`now()`, updatedBy: actor.accountId })
        .where(
          inArray(
            ratePlan.id,
            superseded.map((p) => p.id),
          ),
        );
    }
    await this.audit.record({
      action: 'pricing.rate_plan.published',
      targetType: 'rate_plan',
      targetId: id,
      actor,
      after: { name: existing.name, superseded: superseded.map((p) => p.name) },
    });
    await this.outbox.emit({
      type: 'pricing.rate_plan.published.v1',
      aggregateType: 'rate_plan',
      aggregateId: id,
      payload: { categoryCode: existing.categoryCode, locationCode: existing.locationCode },
    });
    return this.db.select().from(ratePlan).where(eq(ratePlan.id, id)).limit(1);
  }

  /** Delete a draft rate plan (and its tiers). Published / retired plans are immutable history. */
  async deletePlan(actor: Actor, id: string) {
    const [existing] = await this.db.select().from(ratePlan).where(eq(ratePlan.id, id)).limit(1);
    if (!existing) throw AppError.notFound('rate plan');
    this.assertPlanWritable(actor, existing.locationCode);
    if (existing.status !== 'draft' && existing.status !== 'in_review') {
      throw AppError.businessRule('Only a draft rate plan can be deleted', {
        reason: 'not_a_draft',
      });
    }
    await this.db.delete(rateTier).where(eq(rateTier.ratePlanId, id));
    await this.db.delete(ratePlan).where(eq(ratePlan.id, id));
    await this.audit.record({
      action: 'pricing.rate_plan.deleted',
      targetType: 'rate_plan',
      targetId: id,
      actor,
      after: { name: existing.name, category: existing.categoryCode },
    });
    return { id, deleted: true };
  }
}
