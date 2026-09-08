import { seoConfigSchema, zPagesConfig, H1_CAPABLE_BLOCKS } from '@carrental/contracts';
import { brandConfigSchema, validateBrandConfig } from '@carrental/theme';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { configVersion } from '../../database/schema/admin';
import { organization } from '../../database/schema/org';

/** Built-in policy defaults — used until a published `policy` config version overrides them. */
interface PolicyDefaults {
  readonly [key: string]: Readonly<Record<string, number>>;
  readonly cancellation: { readonly freeCancelHours: number; readonly lateFeeBps: number };
  readonly fuel_rate: { readonly minorPerPct: number };
}

export const POLICY_DEFAULTS: PolicyDefaults = {
  cancellation: { freeCancelHours: 48, lateFeeBps: 2000 },
  fuel_rate: { minorPerPct: 150 },
};

@Injectable()
export class ConfigVersionService {
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

  async list(kind: string, key?: string) {
    const where = [eq(configVersion.kind, kind)];
    if (key) where.push(eq(configVersion.key, key));
    const rows = await this.db
      .select()
      .from(configVersion)
      .where(and(...where))
      .orderBy(asc(configVersion.key), desc(configVersion.revision));
    return rows.map((r) => this.shape(r));
  }

  async current(kind: string, key: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.db
      .select()
      .from(configVersion)
      .where(
        and(
          eq(configVersion.kind, kind),
          eq(configVersion.key, key),
          eq(configVersion.state, 'published'),
        ),
      )
      .orderBy(desc(configVersion.revision))
      .limit(1);
    return row?.payload ?? null;
  }

  /** Read a numeric policy value, falling back to the built-in default. */
  async policy(key: string, field: string): Promise<number> {
    const current = await this.current('policy', key);
    const v = current?.[field];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    return POLICY_DEFAULTS[key]?.[field] ?? 0;
  }

  async draft(
    actor: Actor,
    input: { kind: string; key: string; payload: Record<string, unknown>; note?: string },
  ) {
    this.validate(input.kind, input.payload);
    const orgId = await this.orgId();
    const [prev] = await this.db
      .select({ v: configVersion.revision })
      .from(configVersion)
      .where(and(eq(configVersion.kind, input.kind), eq(configVersion.key, input.key)))
      .orderBy(desc(configVersion.revision))
      .limit(1);
    const [row] = await this.db
      .insert(configVersion)
      .values({
        organizationId: orgId,
        kind: input.kind,
        key: input.key,
        revision: (prev?.v ?? 0) + 1,
        state: 'draft',
        payload: input.payload,
        note: input.note ?? null,
        createdBy: actor.accountId,
      })
      .returning();
    await this.audit.record({
      action: 'config.version.drafted',
      targetType: 'config_version',
      targetId: row!.id,
      actor,
      after: { kind: input.kind, key: input.key, revision: row!.revision },
    });
    return this.shape(row!);
  }

  async submit(actor: Actor, id: string) {
    const row = await this.load(id);
    if (row.state !== 'draft') {
      throw AppError.businessRule(`A ${row.state} version cannot be submitted`, {
        reason: row.state,
      });
    }
    this.validate(row.kind, row.payload);
    await this.db
      .update(configVersion)
      .set({
        state: 'in_review',
        submittedAt: sql`now()`,
        submittedBy: actor.accountId,
        updatedAt: sql`now()`,
      })
      .where(eq(configVersion.id, id));
    await this.audit.record({
      action: 'config.version.submitted',
      targetType: 'config_version',
      targetId: id,
      actor,
    });
    return this.shape(await this.load(id));
  }

  async approve(actor: Actor, id: string) {
    const row = await this.load(id);
    if (row.state !== 'in_review') {
      throw AppError.businessRule(`A ${row.state} version cannot be approved`, {
        reason: row.state,
      });
    }
    // separation of duties (FR-ADM-006): the person who drafted a change may not approve it.
    if (row.createdBy === actor.accountId) {
      throw new AppError('approval_required', {
        title: 'A different reviewer must approve this change',
        params: { reason: 'author_cannot_approve' },
      });
    }
    this.validate(row.kind, row.payload);

    await this.db.transaction(async (tx) => {
      await tx
        .update(configVersion)
        .set({ state: 'superseded', updatedAt: sql`now()` })
        .where(
          and(
            eq(configVersion.kind, row.kind),
            eq(configVersion.key, row.key),
            eq(configVersion.state, 'published'),
          ),
        );
      await tx
        .update(configVersion)
        .set({
          state: 'published',
          approvedAt: sql`now()`,
          approvedBy: actor.accountId,
          effectiveFrom: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(configVersion.id, id));
      await this.outbox.emit(
        {
          type: 'config.version.published.v1',
          aggregateType: 'config_version',
          aggregateId: id,
          payload: { kind: row.kind, key: row.key, revision: row.revision },
        },
        tx,
      );
    });
    await this.audit.record({
      action: 'config.version.approved',
      targetType: 'config_version',
      targetId: id,
      actor,
      after: { approvedBy: actor.accountId, authoredBy: row.createdBy },
    });
    return this.shape(await this.load(id));
  }

  async reject(actor: Actor, id: string, note: string) {
    const row = await this.load(id);
    if (row.state !== 'in_review') {
      throw AppError.businessRule(`A ${row.state} version cannot be rejected`, {
        reason: row.state,
      });
    }
    await this.db
      .update(configVersion)
      .set({ state: 'rejected', note, updatedAt: sql`now()` })
      .where(eq(configVersion.id, id));
    await this.audit.record({
      action: 'config.version.rejected',
      targetType: 'config_version',
      targetId: id,
      actor,
    });
    return this.shape(await this.load(id));
  }

  /** Compute the customer-facing effect of a candidate payload without publishing it. */
  preview(kind: string, payload: Record<string, unknown>) {
    this.validate(kind, payload);
    if (kind === 'policy') {
      const lateFeeBps = Number(payload.lateFeeBps ?? POLICY_DEFAULTS.cancellation.lateFeeBps);
      const freeCancelHours = Number(
        payload.freeCancelHours ?? POLICY_DEFAULTS.cancellation.freeCancelHours,
      );
      const minorPerPct = Number(payload.minorPerPct ?? POLICY_DEFAULTS.fuel_rate.minorPerPct);
      return {
        examples: [
          `A $100.00 booking cancelled inside ${freeCancelHours}h keeps a ${(lateFeeBps / 100).toFixed(0)}% fee = $${((10000 * lateFeeBps) / 10000 / 100).toFixed(2)}`,
          `Returning 20% low on fuel = $${((20 * minorPerPct) / 100).toFixed(2)}`,
        ],
      };
    }
    if (kind === 'branding') {
      const parsed = brandConfigSchema.parse(payload);
      const violations = validateBrandConfig(parsed);
      return {
        examples: [
          violations.length === 0
            ? 'All colour pairs clear WCAG AA in light and dark.'
            : `${violations.length} colour pair(s) fail AA: ` +
              violations.map((v) => `${v.mode} ${v.fg}/${v.bg} ${v.ratio}:1`).join(', '),
          `Radius ${parsed.radius}, ${parsed.density} density, ${parsed.font} font.`,
        ],
        aaClean: violations.length === 0,
      };
    }
    if (kind === 'seo') {
      const c = seoConfigSchema.parse(payload);
      const home = c.titleTemplate.includes('%s')
        ? c.titleTemplate.replace('%s', c.defaultTitle)
        : c.defaultTitle;
      return {
        examples: [
          c.indexable
            ? `Pages are indexable. Home <title>: "${home}"`
            : 'noindex, nofollow is set — the site will be hidden from search engines and the sitemap is empty.',
          `A vehicle page <title>: "${
            c.titleTemplate.includes('%s')
              ? c.titleTemplate.replace('%s', 'Economy cars')
              : 'Economy cars'
          }"`,
          `Canonical + hreflang built from ${c.canonicalBaseUrl}`,
          c.defaultDescription.length > 160
            ? `Default description is ${c.defaultDescription.length} chars — search results may truncate it.`
            : `Default description (${c.defaultDescription.length} chars) fits a result snippet.`,
        ],
      };
    }
    if (kind === 'pages') {
      const parsed = zPagesConfig.parse(payload);
      const out: string[] = [];
      for (const [pageKey, page] of Object.entries(parsed.pages)) {
        const visible = page.blocks.filter((bl) => !bl.hidden);
        const kinds = visible.map((bl) => bl.type);
        const hasH1 = visible.some((bl) => H1_CAPABLE_BLOCKS.includes(bl.type));
        const localeCoverage = (loc: 'fr' | 'ar') => {
          let total = 0;
          let filled = 0;
          const walk = (v: unknown) => {
            if (v && typeof v === 'object') {
              if ('en' in (v as Record<string, unknown>)) {
                total++;
                if ((v as Record<string, unknown>)[loc]) filled++;
                return;
              }
              for (const val of Object.values(v as Record<string, unknown>)) walk(val);
            }
          };
          walk(page.blocks);
          return total === 0 ? 100 : Math.round((filled / total) * 100);
        };
        out.push(
          `${pageKey}: ${visible.length}/${page.blocks.length} blocks visible — ${kinds.join(', ')}`,
        );
        out.push(`${pageKey}: translated fr ${localeCoverage('fr')}% · ar ${localeCoverage('ar')}%`);
        if (!hasH1) out.push(`${pageKey}: no heading block visible — the page will have no <h1>.`);
        if (pageKey === 'home' && !kinds.includes('search-card')) {
          out.push(`${pageKey}: the search block is hidden — customers can't start a booking here.`);
        }
      }
      return { examples: out };
    }
    return { examples: ['No preview available for this kind yet.'] };
  }

  private validate(kind: string, payload: Record<string, unknown>) {
    const issues: Array<{ path: string; code: string }> = [];
    if (kind === 'policy') {
      for (const [k, v] of Object.entries(payload)) {
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
          issues.push({ path: k, code: 'must_be_non_negative_number' });
        }
      }
      if ('lateFeeBps' in payload && Number(payload.lateFeeBps) > 10000) {
        issues.push({ path: 'lateFeeBps', code: 'out_of_range' });
      }
    }
    if (kind === 'branding') {
      // DEC-025 — curated theme/branding. Structure via the shared schema, then WCAG AA.
      const parsed = brandConfigSchema.safeParse(payload);
      if (!parsed.success) {
        for (const iss of parsed.error.issues) {
          issues.push({ path: iss.path.join('.') || '(root)', code: iss.code });
        }
      } else {
        for (const v of validateBrandConfig(parsed.data)) {
          issues.push({
            path: `colors.${v.mode}.${v.fg}/${v.bg}`,
            code: `contrast_below_${v.min}_(${v.ratio})`,
          });
        }
        for (const [k, ref] of Object.entries(parsed.data.assets)) {
          if (k === 'wordmark' || ref == null) continue;
          const ok =
            /^https:\/\/\S+$/.test(ref) ||
            // `obj:<key>` — an uploaded asset (POST /config/branding/assets); the API resolves
            // it to a short-lived signed URL in GET /meta/branding (STAGE-009).
            /^obj:[A-Za-z0-9._/-]+$/.test(ref) ||
            (k === 'favicon' && /^data:image\/[a-z.+-]+;base64,[A-Za-z0-9+/=]+$/.test(ref));
          if (!ok) issues.push({ path: `assets.${k}`, code: 'must_be_https_url' });
        }
      }
    }
    if (kind === 'seo') {
      const parsed = seoConfigSchema.safeParse(payload);
      if (!parsed.success) {
        for (const iss of parsed.error.issues) {
          issues.push({ path: iss.path.join('.') || '(root)', code: iss.code });
        }
      }
    }
    if (kind === 'pages') {
      const parsed = zPagesConfig.safeParse(payload);
      if (!parsed.success) {
        for (const iss of parsed.error.issues) {
          issues.push({ path: iss.path.join('.') || '(root)', code: iss.code });
        }
      } else {
        if (JSON.stringify(payload).length > 262_144) {
          issues.push({ path: '(root)', code: 'payload_too_large' });
        }
        for (const [pageKey, page] of Object.entries(parsed.data.pages)) {
          const ids = new Set<string>();
          for (const bl of page.blocks) {
            if (ids.has(bl.id)) issues.push({ path: `${pageKey}.${bl.id}`, code: 'duplicate_block_id' });
            ids.add(bl.id);
            if (bl.type === 'image' && !bl.hidden) {
              const p = bl.props as { src?: string; alt?: { en?: string }; decorative?: boolean };
              if (!p.src || p.src === 'obj:placeholder') {
                issues.push({ path: `${pageKey}.${bl.id}.props.src`, code: 'image_not_uploaded' });
              }
              if (!p.decorative && !p.alt?.en?.trim()) {
                issues.push({ path: `${pageKey}.${bl.id}.props.alt`, code: 'alt_text_required' });
              }
            }
          }
          if (pageKey === 'home') {
            const search = page.blocks.find((bl) => bl.type === 'search-card');
            if (!search || search.hidden) {
              issues.push({ path: `${pageKey}.search-card`, code: 'search_block_required' });
            }
            const wantsFleet = page.blocks.some(
              (bl) =>
                !bl.hidden &&
                JSON.stringify(bl.props).includes('#fleet') &&
                bl.type !== 'fleet',
            );
            const hasFleet = page.blocks.some((bl) => bl.type === 'fleet' && !bl.hidden);
            if (wantsFleet && !hasFleet) {
              issues.push({ path: `${pageKey}.fleet`, code: 'fleet_anchor_target_missing' });
            }
          }
        }
      }
    }
    if (issues.length) throw AppError.validation(issues, 'Config payload is not valid');
  }

  private async load(id: string) {
    const [row] = await this.db
      .select()
      .from(configVersion)
      .where(eq(configVersion.id, id))
      .limit(1);
    if (!row) throw AppError.notFound('config version');
    return row;
  }

  private shape(r: typeof configVersion.$inferSelect) {
    return {
      id: r.id,
      kind: r.kind,
      key: r.key,
      revision: r.revision,
      state: r.state,
      payload: r.payload,
      note: r.note,
      createdBy: r.createdBy,
      approvedBy: r.approvedBy,
      effectiveFrom: r.effectiveFrom ? new Date(r.effectiveFrom).toISOString() : null,
      createdAt: new Date(r.createdAt).toISOString(),
    };
  }
}
