import {
  seoConfigSchema,
  zConsentConfig,
  zPagesConfig,
  H1_CAPABLE_BLOCKS,
} from '@carrental/contracts';
import { brandConfigSchema, validateBrandConfig } from '@carrental/theme';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { isUniqueViolation } from '../../common/db-error';
import { OutboxService } from '../../common/outbox/outbox.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { configVersion } from '../../database/schema/admin';
import { organization } from '../../database/schema/org';

import { ConfigPublic } from './config.public';

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

/**
 * The ops builder feeds the live preview signed `/api/v1/assets/<key>?…` URLs and can echo one
 * back on save. Signed URLs expire, so a stored payload must only ever hold the durable `obj:`
 * ref — collapse any resolved asset URL back to `obj:<key>` before validating/persisting.
 */
function normalizePagesAssets(payload: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(payload, (_k, v) =>
    typeof v === 'string'
      ? v.replace(/^(?:https?:\/\/[^/]+)?\/api\/v1\/assets\/([A-Za-z0-9._/-]+)\?.*$/, 'obj:$1')
      : v,
  );
  return JSON.parse(json) as Record<string, unknown>;
}

@Injectable()
export class ConfigVersionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigPublic,
  ) {}

  /** Delegates to `ConfigPublic.defaultOrganization()` (deterministically ordered by
   *  `createdAt`) rather than repeating the raw, unordered `organization` query. */
  private async orgId(): Promise<string> {
    const org = await this.config.defaultOrganization();
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
    if (input.kind === 'pages') input.payload = normalizePagesAssets(input.payload);
    this.validate(input.kind, input.payload, input.key);
    const orgId = await this.orgId();

    // `revision` is `max + 1` for (kind,key). Two concurrent drafts read the same max and would
    // collide on the unique index — recompute and retry a few times before giving up with a 409.
    let row: typeof configVersion.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5 && !row; attempt++) {
      const [prev] = await this.db
        .select({ v: configVersion.revision })
        .from(configVersion)
        .where(and(eq(configVersion.kind, input.kind), eq(configVersion.key, input.key)))
        .orderBy(desc(configVersion.revision))
        .limit(1);
      try {
        [row] = await this.db
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
      } catch (err) {
        // a lost race on `revision` — recompute and try again; anything else is a real error.
        if (!isUniqueViolation(err)) throw err;
      }
    }
    if (!row) {
      throw new AppError('state_conflict', {
        title: 'Another revision of this setting was just drafted — reload and try again',
        params: { reason: 'concurrent_draft' },
      });
    }
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
    this.validate(row.kind, row.payload, row.key);
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
    this.validate(row.kind, row.payload, row.key);

    try {
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
    } catch (err) {
      // the partial unique index (one published row per kind+key) — another reviewer published a
      // different revision of this setting a moment ago.
      if (isUniqueViolation(err)) {
        throw new AppError('state_conflict', {
          title: 'Another revision of this setting was just published — reload the history',
          params: { reason: 'already_published' },
        });
      }
      throw err;
    }
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
    // keep the author's own draft note — record the reviewer's reason alongside it, don't clobber it.
    const merged = row.note ? `${row.note}\n\n— Rejected: ${note}` : `Rejected: ${note}`;
    await this.db
      .update(configVersion)
      .set({ state: 'rejected', note: merged, updatedAt: sql`now()` })
      .where(eq(configVersion.id, id));
    await this.audit.record({
      action: 'config.version.rejected',
      targetType: 'config_version',
      targetId: id,
      actor,
      after: { reason: note },
    });
    return this.shape(await this.load(id));
  }

  /**
   * Discard an unsubmitted draft. Only `draft` rows can be deleted — a `rejected` revision was
   * reviewed and stays in the record (FR-ADM-005 append-only); to carry it forward the author
   * drafts a fresh revision from it in the UI.
   */
  async remove(actor: Actor, id: string) {
    const row = await this.load(id);
    if (row.state !== 'draft') {
      throw AppError.businessRule(`A ${row.state} version cannot be deleted`, {
        reason: row.state,
      });
    }
    await this.db.delete(configVersion).where(eq(configVersion.id, id));
    await this.audit.record({
      action: 'config.version.deleted',
      targetType: 'config_version',
      targetId: id,
      actor,
      before: { kind: row.kind, key: row.key, revision: row.revision },
    });
  }

  private async orgCurrency(): Promise<string> {
    const [org] = await this.db
      .select({ c: organization.defaultCurrency })
      .from(organization)
      .limit(1);
    return org?.c ?? 'USD';
  }

  /** Compute the customer-facing effect of a candidate payload without publishing it. */
  async preview(kind: string, payload: Record<string, unknown>, key?: string) {
    this.validate(kind, payload, key);
    if (kind === 'policy') {
      const lateFeeBps = Number(payload.lateFeeBps ?? POLICY_DEFAULTS.cancellation.lateFeeBps);
      const freeCancelHours = Number(
        payload.freeCancelHours ?? POLICY_DEFAULTS.cancellation.freeCancelHours,
      );
      const minorPerPct = Number(payload.minorPerPct ?? POLICY_DEFAULTS.fuel_rate.minorPerPct);
      // A worked example on a sample booking / fuel deficit. The maths lives here (single source
      // with the cancel + return settlement); the ops UI localises the surrounding sentence from
      // the structured `policy` block. `examples` is kept for API consumers.
      const SAMPLE_TOTAL_MINOR = 10000;
      const SAMPLE_FUEL_DEFICIT_PCT = 20;
      const lateFeeMinor = Math.round((SAMPLE_TOTAL_MINOR * lateFeeBps) / 10000);
      const fuelChargeMinor = SAMPLE_FUEL_DEFICIT_PCT * minorPerPct;
      const cancellation = `A $100.00 booking cancelled inside ${freeCancelHours}h keeps a ${(lateFeeBps / 100).toFixed(0)}% fee = $${(lateFeeMinor / 100).toFixed(2)}`;
      const fuel = `Returning ${SAMPLE_FUEL_DEFICIT_PCT}% low on fuel = $${(fuelChargeMinor / 100).toFixed(2)}`;
      // when the caller names the key, only show the example that key drives.
      const examples =
        key === 'cancellation'
          ? [cancellation]
          : key === 'fuel_rate'
            ? [fuel]
            : [cancellation, fuel];
      return {
        examples,
        policy: {
          key: key ?? null,
          currency: await this.orgCurrency(),
          freeCancelHours,
          lateFeeBps,
          minorPerPct,
          sampleTotalMinor: SAMPLE_TOTAL_MINOR,
          lateFeeMinor,
          sampleFuelDeficitPct: SAMPLE_FUEL_DEFICIT_PCT,
          fuelChargeMinor,
        },
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
        out.push(
          `${pageKey}: translated fr ${localeCoverage('fr')}% · ar ${localeCoverage('ar')}%`,
        );
        if (!hasH1) out.push(`${pageKey}: no heading block visible — the page will have no <h1>.`);
        if (pageKey === 'home' && !kinds.includes('search-card')) {
          out.push(
            `${pageKey}: the search block is hidden — customers can't start a booking here.`,
          );
        }
      }
      return { examples: out };
    }
    if (kind === 'consent') {
      const c = zConsentConfig.parse(payload);
      const shown = c.categories.filter((cat) => cat.shown);
      const optIn = c.categories.filter((cat) => cat.defaultOn && cat.id !== 'necessary');
      const cover = (loc: 'fr' | 'ar') => {
        const fields = [
          c.text.bannerBody,
          c.text.prefsIntro,
          ...c.categories.map((cat) => cat.name),
          ...c.categories.map((cat) => cat.description),
        ];
        const filled = fields.filter((f) => (f as Record<string, string>)[loc]?.trim()).length;
        return Math.round((filled / fields.length) * 100);
      };
      return {
        examples: [
          c.enabled
            ? `Banner is ON — ${c.layout.position === 'bar' ? 'bottom bar' : 'corner card'}, "Reject all" ${c.layout.showRejectAll ? 'shown' : 'hidden'}.`
            : 'Banner is OFF — no consent prompt shown.',
          `Policy version ${c.policyVersion} — bumping it re-asks every returning visitor.`,
          `${shown.length} categories in the preference centre; pre-ticked: ${
            optIn.length ? optIn.map((cat) => cat.id).join(', ') : 'none (necessary only)'
          }.`,
          `Translations — fr ${cover('fr')}% · ar ${cover('ar')}%.`,
          `Cookie declaration: ${c.cookieTable.length} row(s) on the Cookie Policy page.`,
        ],
      };
    }
    return { examples: ['No preview available for this kind yet.'] };
  }

  /**
   * The exact numeric fields each `policy` key accepts, with the sane range for each — an unknown
   * or missing field is a typo, and an out-of-range value is a fat-finger that would directly
   * mis-price a customer (e.g. a fuel rate of 15000 minor/pct read as "$150.00 per point").
   */
  /** The `kind`s with a real dedicated validator below — anything else falls through to the
   *  basic structural sanity check at the end of `validate()` instead of silently passing. */
  private static readonly VALIDATED_KINDS = new Set([
    'policy',
    'branding',
    'seo',
    'pages',
    'consent',
  ]);

  private static readonly POLICY_FIELD_BOUNDS: Record<string, Record<string, { max: number }>> = {
    cancellation: {
      freeCancelHours: { max: 8760 }, // one year
      lateFeeBps: { max: 10000 }, // 100% of the reservation total
    },
    fuel_rate: {
      minorPerPct: { max: 100000 }, // 1000.00 major units per percentage point
    },
  };

  private validate(kind: string, payload: Record<string, unknown>, key?: string) {
    const issues: Array<{ path: string; code: string }> = [];
    if (kind === 'policy') {
      const bounds = key ? ConfigVersionService.POLICY_FIELD_BOUNDS[key] : undefined;
      if (key && !bounds) issues.push({ path: 'key', code: 'unknown_policy_key' });
      for (const [k, v] of Object.entries(payload)) {
        if (bounds && !(k in bounds)) {
          issues.push({ path: k, code: 'unknown_field' });
          continue;
        }
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
          issues.push({ path: k, code: 'must_be_non_negative_number' });
          continue;
        }
        const max = bounds?.[k]?.max;
        if (max != null && v > max) issues.push({ path: k, code: 'out_of_range' });
      }
      for (const f of Object.keys(bounds ?? {})) {
        if (!(f in payload)) issues.push({ path: f, code: 'required' });
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
            if (ids.has(bl.id))
              issues.push({ path: `${pageKey}.${bl.id}`, code: 'duplicate_block_id' });
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
                !bl.hidden && JSON.stringify(bl.props).includes('#fleet') && bl.type !== 'fleet',
            );
            const hasFleet = page.blocks.some((bl) => bl.type === 'fleet' && !bl.hidden);
            if (wantsFleet && !hasFleet) {
              issues.push({ path: `${pageKey}.fleet`, code: 'fleet_anchor_target_missing' });
            }
          }
        }
      }
    }
    if (kind === 'consent') {
      const parsed = zConsentConfig.safeParse(payload);
      if (!parsed.success) {
        for (const iss of parsed.error.issues) {
          issues.push({ path: iss.path.join('.') || '(root)', code: iss.code });
        }
      } else {
        const c = parsed.data;
        if (!c.categories.some((cat) => cat.id === 'necessary')) {
          issues.push({ path: 'categories', code: 'necessary_category_required' });
        }
        for (const cat of c.categories) {
          if (!cat.name.en.trim())
            issues.push({ path: `categories.${cat.id}.name`, code: 'name_required' });
        }
        if (!c.text.bannerBody.en.trim()) {
          issues.push({ path: 'text.bannerBody', code: 'banner_body_required' });
        }
      }
    }
    if (!ConfigVersionService.VALIDATED_KINDS.has(kind)) {
      // `report.controller.ts`'s draft schema also accepts 'pricing' | 'product' | 'location'
      // (the table's original doc comment) but nothing in this codebase actually consumes those
      // kinds today — rate plans and catalogue products each got their own dedicated
      // service/table instead. There was never a validator wired up for them here, and any
      // future kind would land in the exact same gap: rather than silently no-op passing,
      // enforce a basic structural sanity check so a malformed/oversized draft can never sit
      // invisibly in the table just because nobody's written its real validator yet.
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        issues.push({ path: '(root)', code: 'must_be_object' });
      } else if (JSON.stringify(payload).length > 262_144) {
        issues.push({ path: '(root)', code: 'payload_too_large' });
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
