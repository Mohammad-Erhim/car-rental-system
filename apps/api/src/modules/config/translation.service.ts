import { NAMESPACED_RESOURCES, SUPPORTED_LOCALE_CODES } from '@carrental/i18n';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNotNull, ne, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { CacheBus } from '../../common/cache/cache-bus';
import { isUniqueViolation } from '../../common/db-error';
import { revOf } from '../../common/i18n-source-rev';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { vehicleCategory, vehicleFeature } from '../../database/schema/catalogue';
import { customer } from '../../database/schema/customer';
import { locale, translation } from '../../database/schema/i18n';
import { account } from '../../database/schema/iam';
import { lookupValue } from '../../database/schema/lookup';

const LOOKUP_NS = 'lookup:';
/** Kept in sync with `CatalogueService`'s own constants by literal value (not an import — that
 *  would cross a module boundary for two string constants) — see its comment for why category/
 *  feature display text is translated through this exact mechanism. */
const CATALOGUE_CATEGORY_NS = 'catalogue:category';
const CATALOGUE_FEATURE_NS = 'catalogue:feature';
const DESCRIPTION_SUFFIX = '.description';

/**
 * Translation catalogue (FR-ADM-012, SRS-I18N-003). Completeness + publish status by language;
 * draft → review → publish workflow; missing / outdated / fallback reporting.
 *
 * The **key catalogue** is the bundled `en` string set (`NAMESPACED_RESOURCES`) unioned with any
 * DB-only namespaces (reference-data labels under `lookup:*`) — never just the rows that happen
 * to be in the `translation` table, so a string added in code shows up here with no re-seed.
 */
@Injectable()
export class TranslationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly cache: CacheBus,
  ) {}

  /**
   * The `en` source for a namespace: `{ key: value }`.
   *  - bundled UI namespaces (`common`, …) come from `NAMESPACED_RESOURCES`;
   *  - `lookup:<type>` namespaces come from the active reference-data values of that type
   *    (`lookupValue.defaultLabel` is the English source);
   *  - a DB `en` translation row overlays either (an edited English label / string).
   */
  private async sourceCatalogue(namespace: string): Promise<Map<string, string>> {
    const out = new Map<string, string>(Object.entries(NAMESPACED_RESOURCES.en?.[namespace] ?? {}));
    if (namespace.startsWith(LOOKUP_NS)) {
      const typeCode = namespace.slice(LOOKUP_NS.length);
      const values = await this.db
        .select({ code: lookupValue.code, label: lookupValue.defaultLabel })
        .from(lookupValue)
        .where(and(eq(lookupValue.typeCode, typeCode), eq(lookupValue.isActive, true)));
      for (const v of values) out.set(v.code, v.label);
    }
    if (namespace === CATALOGUE_CATEGORY_NS) {
      const cats = await this.db
        .select({
          code: vehicleCategory.code,
          displayName: vehicleCategory.displayName,
          description: vehicleCategory.description,
        })
        .from(vehicleCategory);
      for (const c of cats) {
        out.set(c.code, c.displayName);
        if (c.description) out.set(`${c.code}${DESCRIPTION_SUFFIX}`, c.description);
      }
    }
    if (namespace === CATALOGUE_FEATURE_NS) {
      const feats = await this.db
        .select({ code: vehicleFeature.code, label: vehicleFeature.label })
        .from(vehicleFeature);
      for (const f of feats) out.set(f.code, f.label);
    }
    const rows = await this.db
      .select({ key: translation.key, value: translation.value })
      .from(translation)
      .where(and(eq(translation.namespace, namespace), eq(translation.localeCode, 'en')));
    for (const r of rows) out.set(r.key, r.value);
    return out;
  }

  /** Every `en` source catalogue keyed by namespace — bundled UI strings + every reference-data
   *  type's active value labels + any DB `en` overrides, each set built in one query. */
  private async allSourceCatalogues(): Promise<Map<string, Map<string, string>>> {
    const out = new Map<string, Map<string, string>>();
    for (const [ns, entries] of Object.entries(NAMESPACED_RESOURCES.en ?? {})) {
      out.set(ns, new Map(Object.entries(entries as Record<string, string>)));
    }
    const values = await this.db
      .select({
        typeCode: lookupValue.typeCode,
        code: lookupValue.code,
        label: lookupValue.defaultLabel,
      })
      .from(lookupValue)
      .where(eq(lookupValue.isActive, true));
    for (const v of values) {
      const ns = `${LOOKUP_NS}${v.typeCode}`;
      let cat = out.get(ns);
      if (!cat) out.set(ns, (cat = new Map()));
      cat.set(v.code, v.label);
    }
    const cats = await this.db
      .select({
        code: vehicleCategory.code,
        displayName: vehicleCategory.displayName,
        description: vehicleCategory.description,
      })
      .from(vehicleCategory);
    if (cats.length) {
      const cat = new Map<string, string>();
      for (const c of cats) {
        cat.set(c.code, c.displayName);
        if (c.description) cat.set(`${c.code}${DESCRIPTION_SUFFIX}`, c.description);
      }
      out.set(CATALOGUE_CATEGORY_NS, cat);
    }
    const feats = await this.db
      .select({ code: vehicleFeature.code, label: vehicleFeature.label })
      .from(vehicleFeature);
    if (feats.length) {
      out.set(CATALOGUE_FEATURE_NS, new Map(feats.map((f) => [f.code, f.label])));
    }
    const rows = await this.db
      .select({ namespace: translation.namespace, key: translation.key, value: translation.value })
      .from(translation)
      .where(eq(translation.localeCode, 'en'));
    for (const r of rows) {
      let cat = out.get(r.namespace);
      if (!cat) out.set(r.namespace, (cat = new Map()));
      cat.set(r.key, r.value);
    }
    return out;
  }

  async completeness() {
    const locales = await this.db.select().from(locale).where(eq(locale.isActive, true));
    const catalogues = await this.allSourceCatalogues();
    const namespaces = [...catalogues.keys()].sort();
    // every published key, so "done" counts only keys that are *in the current source catalogue* —
    // a stale published row for a key that no longer exists must not inflate coverage past 100%.
    const publishedRows = await this.db
      .select({
        namespace: translation.namespace,
        localeCode: translation.localeCode,
        key: translation.key,
      })
      .from(translation)
      .where(isNotNull(translation.publishedValue));
    const publishedByNsLoc = new Map<string, Set<string>>();
    for (const r of publishedRows) {
      const k = `${r.namespace}:${r.localeCode}`;
      let set = publishedByNsLoc.get(k);
      if (!set) publishedByNsLoc.set(k, (set = new Set()));
      set.add(r.key);
    }

    const rows = [];
    for (const ns of namespaces) {
      const catalogue = catalogues.get(ns) ?? new Map<string, string>();
      const total = catalogue.size;
      for (const loc of locales) {
        // the source language is complete by definition; others count published keys that still
        // exist in the catalogue
        let done: number;
        if (loc.code === 'en') {
          done = total;
        } else {
          const pub = publishedByNsLoc.get(`${ns}:${loc.code}`);
          done = pub ? [...pub].filter((key) => catalogue.has(key)).length : 0;
        }
        rows.push({
          locale: loc.code,
          namespace: ns,
          total,
          published: done,
          missing: Math.max(0, total - done),
          // 100% is reserved for genuinely complete — round everything else down so "100%" never
          // sits next to a non-zero "missing" count
          coveragePct:
            total === 0 || done >= total ? 100 : Math.min(99, Math.floor((done / total) * 100)),
        });
      }
    }
    return { locales: locales.map((l) => l.code), rows };
  }

  /** A known locale — one that ships bundled strings, or one enabled from the dashboard. */
  private async isKnownLocale(code: string): Promise<boolean> {
    if (SUPPORTED_LOCALE_CODES.includes(code)) return true;
    const [row] = await this.db
      .select({ code: locale.code })
      .from(locale)
      .where(eq(locale.code, code))
      .limit(1);
    return !!row;
  }

  /**
   * Published overrides for one namespace + locale as a flat `{ key: value }` map. Public
   * (no draft/in-review content) — `apps/site` merges this over the bundled base at build/ISR
   * time, and `apps/web` at runtime (DEC-024).
   */
  async publishedBundle(namespace: string, localeCode: string): Promise<Record<string, string>> {
    if (!(await this.isKnownLocale(localeCode))) return {};
    // `publishedValue` is the live string — set the first time a key is published and frozen while
    // a later edit is drafted/in review, so an in-progress edit never blanks a live translation.
    const rows = await this.db
      .select({ key: translation.key, value: translation.publishedValue })
      .from(translation)
      .where(
        and(
          eq(translation.namespace, namespace),
          eq(translation.localeCode, localeCode),
          isNotNull(translation.publishedValue),
        ),
      );
    const out: Record<string, string> = {};
    for (const r of rows) if (r.value != null) out[r.key] = r.value;
    return out;
  }

  async list(namespace: string, localeCode: string) {
    const source = await this.sourceCatalogue(namespace);
    const target = await this.db
      .select()
      .from(translation)
      .where(and(eq(translation.namespace, namespace), eq(translation.localeCode, localeCode)));
    const targetByKey = new Map(target.map((t) => [t.key, t]));
    return [...source.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, sourceValue]) => {
        const t = targetByKey.get(key);
        return {
          key,
          source: sourceValue,
          translation: t?.value ?? null,
          /** the value currently live (frozen while an edit is in review) */
          published: t?.publishedValue ?? null,
          status: t ? t.status : 'missing',
          // only flag a real drift: a stored hash that no longer matches the source. A null
          // `sourceRevision` means the row predates revision tracking — treat as baseline-unknown.
          outdated:
            !!t && !!t.value && !!t.sourceRevision && t.sourceRevision !== revOf(sourceValue),
          // optimistic-lock token — 0 when there is no row yet
          version: t?.version ?? 0,
          reviewedAt: t?.reviewedAt ?? null,
        };
      });
  }

  async upsert(
    actor: Actor,
    input: {
      namespace: string;
      key: string;
      localeCode: string;
      value: string;
      status?: 'draft' | 'in_review' | 'published';
      /** optimistic-lock guard — the `version` the editor loaded. Omit to force-write. */
      expectedVersion?: number;
    },
  ) {
    // the controller gate is `('config.publish', 'lookup.manage')` (mode 'any') so a plain
    // reference-data editor can draft translations for the labels they own — but that permission
    // is scoped to `lookup:*` (its own description: "Manage reference data values"), and
    // publishing anything is `config.publish`'s job everywhere else in this system (templates,
    // rules, config versions). Without these, `lookup.manage` alone could write into an unrelated
    // namespace (e.g. `common`) or set `status: 'published'` directly, bypassing the separate
    // publish endpoint's `config.publish` gate entirely.
    const canPublish = actor.permissions.includes('config.publish');
    if (!canPublish) {
      if (!input.namespace.startsWith(LOOKUP_NS)) {
        throw AppError.forbidden(
          'lookup.manage can only edit reference-data (lookup:*) translations',
        );
      }
      if ((input.status ?? 'draft') === 'published') {
        throw AppError.forbidden('Publishing a translation directly requires config.publish');
      }
    }
    if (!(await this.isKnownLocale(input.localeCode))) {
      throw new AppError('validation_failed', {
        title: 'Unknown locale',
        fieldErrors: [{ path: 'localeCode', code: 'unsupported' }],
      });
    }
    const status = input.status ?? 'draft';
    const sourceValue = (await this.sourceCatalogue(input.namespace)).get(input.key);
    if (sourceValue === undefined && input.localeCode !== 'en') {
      throw new AppError('validation_failed', {
        title: 'Unknown translation key',
        fieldErrors: [{ path: 'key', code: 'unknown' }],
      });
    }
    const rev = revOf(sourceValue ?? input.value);

    const [existing] = await this.db
      .select()
      .from(translation)
      .where(
        and(
          eq(translation.namespace, input.namespace),
          eq(translation.key, input.key),
          eq(translation.localeCode, input.localeCode),
        ),
      )
      .limit(1);

    let row: typeof translation.$inferSelect | undefined;
    if (existing) {
      // guard the UPDATE itself on the loaded version so two concurrent saves can't both win
      const versionGuard =
        input.expectedVersion != null
          ? and(eq(translation.id, existing.id), eq(translation.version, input.expectedVersion))
          : eq(translation.id, existing.id);
      [row] = await this.db
        .update(translation)
        .set({
          value: input.value,
          // when this save publishes, the live value moves too; a draft/review save freezes it
          ...(status === 'published'
            ? { publishedValue: input.value, reviewedBy: actor.accountId, reviewedAt: sql`now()` }
            : {}),
          status,
          sourceRevision: rev,
          version: sql`${translation.version} + 1`,
          updatedAt: sql`now()`,
        })
        .where(versionGuard)
        .returning();
      if (!row) {
        throw new AppError('state_conflict', {
          title:
            'This translation was changed in another tab or by someone else — reload and try again',
          params: { reason: 'version_mismatch', current: existing.version },
        });
      }
    } else {
      try {
        [row] = await this.db
          .insert(translation)
          .values({
            namespace: input.namespace,
            key: input.key,
            localeCode: input.localeCode,
            value: input.value,
            publishedValue: status === 'published' ? input.value : null,
            status,
            sourceRevision: rev,
            reviewedBy: status === 'published' ? actor.accountId : null,
            reviewedAt: status === 'published' ? sql`now()` : null,
          })
          .returning();
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new AppError('state_conflict', {
            title: 'This translation was just created elsewhere — reload and try again',
            params: { reason: 'concurrent_create' },
          });
        }
        throw err;
      }
    }

    await this.audit.record({
      action: 'config.translation.upserted',
      targetType: 'translation',
      targetId: row!.id,
      actor,
      after: {
        namespace: input.namespace,
        key: input.key,
        localeCode: input.localeCode,
        status: row!.status,
      },
    });
    if (status === 'published') {
      await this.cache.invalidate(`i18n:${input.localeCode}`, { namespace: input.namespace });
      // reference-data value labels live in the `lookup:<type>` namespace and are also served by
      // the values endpoint under its own ETag — keep that in step too.
      if (input.namespace.startsWith('lookup:')) {
        await this.cache.invalidate(input.namespace, { via: 'translation' });
      }
    }
    return row;
  }

  /* ---- locale administration (SRS-I18N-001, FR-GBL-002, DEC-024) ------------------------- */

  async listLocales() {
    return this.db.select().from(locale).orderBy(asc(locale.sortOrder), asc(locale.code));
  }

  async upsertLocale(
    actor: Actor,
    input: {
      code: string;
      nativeName: string;
      englishName: string;
      direction: 'ltr' | 'rtl';
      fallbackChain?: string[];
      sortOrder?: number;
    },
  ) {
    const code = input.code.trim().toLowerCase();
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(code)) {
      throw new AppError('validation_failed', {
        title: 'Invalid BCP-47 locale code',
        fieldErrors: [{ path: 'code', code: 'invalid' }],
      });
    }

    const [existing] = await this.db.select().from(locale).where(eq(locale.code, code)).limit(1);
    // flipping the *default* locale's writing direction reflows the whole product — refuse it here.
    if (existing?.isDefault && input.direction !== existing.direction) {
      throw AppError.businessRule(
        'The default language’s text direction cannot be changed while it is the default',
        { reason: 'default_direction_locked' },
      );
    }

    const fallback = (input.fallbackChain ?? ['en']).filter((c) => c !== code);
    const [row] = await this.db
      .insert(locale)
      .values({
        code,
        nativeName: input.nativeName,
        englishName: input.englishName,
        direction: input.direction,
        fallbackChain: fallback,
        isActive: false,
        isDefault: false,
        testOnly: false,
        sortOrder: input.sortOrder ?? 99,
      })
      .onConflictDoUpdate({
        target: locale.code,
        set: {
          nativeName: input.nativeName,
          englishName: input.englishName,
          direction: input.direction,
          fallbackChain: fallback,
          sortOrder: input.sortOrder ?? sql`${locale.sortOrder}`,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    await this.audit.record({
      action: 'config.locale.upserted',
      targetType: 'locale',
      targetId: row!.id,
      actor,
      after: { code, direction: input.direction },
    });
    await this.cache.invalidate('i18n:locales', {});
    return row;
  }

  /**
   * Delete a locale that was never really used — inactive, not the default, and with no
   * translation rows of its own. A bundled locale (en/fr/ar) can't be deleted. Anything with
   * history is deactivated, never deleted.
   */
  async removeLocale(actor: Actor, code: string) {
    if (SUPPORTED_LOCALE_CODES.includes(code)) {
      throw AppError.businessRule('A built-in language cannot be deleted', { reason: 'built_in' });
    }
    const [row] = await this.db.select().from(locale).where(eq(locale.code, code)).limit(1);
    if (!row) throw AppError.notFound('locale');
    if (row.isDefault || row.isActive) {
      throw AppError.businessRule('Deactivate the language before deleting it', {
        reason: row.isDefault ? 'is_default' : 'is_active',
      });
    }
    const [tr] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(translation)
      .where(eq(translation.localeCode, code));
    if ((tr?.n ?? 0) > 0) {
      throw AppError.businessRule(
        'This language has translations — deactivate it instead so the history is kept',
        { reason: 'has_translations', translations: tr!.n },
      );
    }
    await this.db.delete(locale).where(eq(locale.code, code));
    await this.audit.record({
      action: 'config.locale.deleted',
      targetType: 'locale',
      targetId: row.id,
      actor,
      before: { code, nativeName: row.nativeName },
    });
    await this.cache.invalidate('i18n:locales', {});
  }

  async setLocaleActive(actor: Actor, code: string, isActive: boolean) {
    const [row] = await this.db.select().from(locale).where(eq(locale.code, code)).limit(1);
    if (!row) throw AppError.notFound('locale');
    if (!isActive && row.isDefault) {
      throw AppError.businessRule('The default locale cannot be deactivated', {
        reason: 'is_default',
      });
    }
    let reassigned = 0;
    await this.db.transaction(async (tx) => {
      await tx
        .update(locale)
        .set({ isActive, updatedAt: sql`now()` })
        .where(eq(locale.code, code));
      if (!isActive) {
        // people whose saved language just went away are moved to the default so they aren't
        // stuck on a language the switcher no longer offers.
        const [def] = await tx
          .select({ code: locale.code })
          .from(locale)
          .where(eq(locale.isDefault, true))
          .limit(1);
        const fallback = def?.code ?? 'en';
        const a = await tx
          .update(account)
          .set({ localeCode: fallback, updatedAt: sql`now()` })
          .where(eq(account.localeCode, code))
          .returning({ id: account.id });
        const c = await tx
          .update(customer)
          .set({ localeCode: fallback, updatedAt: sql`now()` })
          .where(eq(customer.localeCode, code))
          .returning({ id: customer.id });
        reassigned = a.length + c.length;
      }
    });
    await this.audit.record({
      action: isActive ? 'config.locale.activated' : 'config.locale.deactivated',
      targetType: 'locale',
      targetId: row.id,
      actor,
      after: isActive ? undefined : { reassignedAccounts: reassigned },
    });
    await this.cache.invalidate('i18n:locales', {});
    return { code, isActive, reassigned };
  }

  async setDefaultLocale(actor: Actor, code: string, opts: { force?: boolean } = {}) {
    const [row] = await this.db.select().from(locale).where(eq(locale.code, code)).limit(1);
    if (!row) throw AppError.notFound('locale');

    // A locale that ships a bundled string file (the launch three) is always complete. Any other
    // — a language added from the dashboard — is only as good as its published overrides; making
    // an untranslated one the default would show English everywhere. Needs `force`.
    if (!SUPPORTED_LOCALE_CODES.includes(code) && !opts.force) {
      const [pub] = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(translation)
        .where(and(eq(translation.localeCode, code), eq(translation.status, 'published')));
      if ((pub?.n ?? 0) === 0) {
        throw AppError.businessRule(
          'This language has no published translations yet — making it the default would show English everywhere. Publish its strings first, or confirm to proceed.',
          { reason: 'default_locale_untranslated', publishedKeys: 0 },
        );
      }
    }

    try {
      await this.db.transaction(async (tx) => {
        await tx.update(locale).set({ isDefault: false }).where(ne(locale.code, code));
        await tx
          .update(locale)
          .set({ isDefault: true, isActive: true, updatedAt: sql`now()` })
          .where(eq(locale.code, code));
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError('state_conflict', {
          title: 'The default language was changed at the same time — reload and try again',
          params: { reason: 'default_race' },
        });
      }
      throw err;
    }
    await this.audit.record({
      action: 'config.locale.default_changed',
      targetType: 'locale',
      targetId: row.id,
      actor,
      after: { code },
    });
    await this.cache.invalidate('i18n:locales', {});
    return { code, isDefault: true };
  }

  async publish(actor: Actor, namespace: string, localeCode: string) {
    const rows = await this.list(namespace, localeCode);
    // block if any mandatory (legal) key is still missing — modelled: keys prefixed 'legal.'
    const missingLegal = rows.filter((r) => r.key.startsWith('legal.') && !r.translation);
    if (missingLegal.length) {
      throw new AppError('business_rule_violation', {
        title: `Cannot publish: ${missingLegal.length} mandatory legal string(s) untranslated`,
        params: { reason: 'missing_mandatory', count: missingLegal.length },
      });
    }
    // blank values are never publishable
    const blank = rows.filter((r) => r.status === 'in_review' && !r.translation?.trim());
    if (blank.length) {
      throw new AppError('business_rule_violation', {
        title: `Cannot publish: ${blank.length} string(s) in review are empty`,
        params: { reason: 'blank_value', count: blank.length },
      });
    }
    const updated = await this.db
      .update(translation)
      .set({
        // the reviewed working value becomes the live value
        publishedValue: sql`${translation.value}`,
        status: 'published',
        reviewedBy: actor.accountId,
        reviewedAt: sql`now()`,
        version: sql`${translation.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(translation.namespace, namespace),
          eq(translation.localeCode, localeCode),
          eq(translation.status, 'in_review'),
        ),
      )
      .returning({ id: translation.id });
    await this.cache.invalidate(`i18n:${localeCode}`, { namespace });
    if (namespace.startsWith('lookup:')) {
      await this.cache.invalidate(namespace, { via: 'translation' });
    }
    await this.audit.record({
      action: 'config.translation.published',
      targetType: 'translation_namespace',
      targetId: `${namespace}:${localeCode}`,
      actor,
      after: { published: updated.length },
    });
    return { published: updated.length, entries: await this.list(namespace, localeCode) };
  }
}
