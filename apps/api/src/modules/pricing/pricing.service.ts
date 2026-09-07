import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { organization } from '../../database/schema/org';
import { quote, quoteLine, ratePlan, rateTier } from '../../database/schema/pricing';

import { computeQuote, isQuoteError, type QuoteComputation } from './quote.calculator';

const QUOTE_TTL_MS = 20 * 60 * 1000; // 20 minutes

export interface PricedQuote {
  computation: QuoteComputation;
  ratePlanId: string;
  ratePlanVersion: number;
  currency: string;
}

@Injectable()
export class PricingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

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

  async listPlans() {
    const orgId = await this.orgId();
    return this.db
      .select()
      .from(ratePlan)
      .where(eq(ratePlan.organizationId, orgId))
      .orderBy(asc(ratePlan.categoryCode), asc(ratePlan.effectiveFrom));
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
  ) {
    const orgId = await this.orgId();
    this.validatePlan(input);
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
      if (existing.status === 'published') {
        throw AppError.businessRule('A published rate plan cannot be edited — create a new one', {
          reason: 'published_immutable',
        });
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

  private validatePlan(input: {
    baseDayMinor: number;
    minDurationHours?: number;
    maxDurationHours?: number | null;
    taxBps?: number;
    tiers?: Array<{ minHours: number; dayMinor: number }>;
    effectiveFrom: string;
    effectiveTo?: string | null;
  }) {
    const issues: Array<{ path: string; code: string }> = [];
    if (input.baseDayMinor <= 0) issues.push({ path: 'baseDayMinor', code: 'must_be_positive' });
    if ((input.taxBps ?? 0) < 0 || (input.taxBps ?? 0) > 10_000)
      issues.push({ path: 'taxBps', code: 'out_of_range' });
    if (
      input.minDurationHours != null &&
      input.maxDurationHours != null &&
      input.minDurationHours > input.maxDurationHours
    )
      issues.push({ path: 'maxDurationHours', code: 'less_than_min' });
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom)
      issues.push({ path: 'effectiveTo', code: 'before_from' });
    for (const [i, t] of (input.tiers ?? []).entries()) {
      if (t.minHours <= 0 || t.dayMinor <= 0)
        issues.push({ path: `tiers.${i}`, code: 'must_be_positive' });
    }
    if (issues.length) throw AppError.validation(issues, 'Rate plan is not valid');
  }

  async publishPlan(actor: Actor, id: string) {
    const [existing] = await this.db.select().from(ratePlan).where(eq(ratePlan.id, id)).limit(1);
    if (!existing) throw AppError.notFound('rate plan');
    if (existing.status === 'published') return existing;
    this.validatePlan(existing);
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
    // retire other published plans for the same exact scope
    await this.db
      .update(ratePlan)
      .set({ status: 'retired', updatedAt: sql`now()` })
      .where(
        and(
          eq(ratePlan.organizationId, existing.organizationId),
          eq(ratePlan.categoryCode, existing.categoryCode),
          existing.locationCode
            ? eq(ratePlan.locationCode, existing.locationCode)
            : isNull(ratePlan.locationCode),
          eq(ratePlan.status, 'published'),
          sql`${ratePlan.id} <> ${id}`,
        ),
      );
    await this.audit.record({
      action: 'pricing.rate_plan.published',
      targetType: 'rate_plan',
      targetId: id,
      actor,
    });
    await this.outbox.emit({
      type: 'pricing.rate_plan.published.v1',
      aggregateType: 'rate_plan',
      aggregateId: id,
      payload: { categoryCode: existing.categoryCode, locationCode: existing.locationCode },
    });
    return this.db.select().from(ratePlan).where(eq(ratePlan.id, id)).limit(1);
  }
}
