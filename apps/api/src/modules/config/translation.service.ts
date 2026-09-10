import { SUPPORTED_LOCALE_CODES } from '@carrental/i18n';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { CacheBus } from '../../common/cache/cache-bus';
import { isUniqueViolation } from '../../common/db-error';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { customer } from '../../database/schema/customer';
import { locale, translation } from '../../database/schema/i18n';
import { account } from '../../database/schema/iam';

/**
 * Translation catalogue (FR-ADM-012, SRS-I18N-003). Completeness + publish status by language;
 * draft → review → publish workflow; missing / outdated / fallback reporting.
 */
@Injectable()
export class TranslationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly cache: CacheBus,
  ) {}

  async completeness() {
    const locales = await this.db.select().from(locale).where(eq(locale.isActive, true));
    const keysByNs = await this.db
      .select({
        namespace: translation.namespace,
        localeCode: translation.localeCode,
        status: translation.status,
        n: sql<number>`count(*)::int`,
      })
      .from(translation)
      .groupBy(translation.namespace, translation.localeCode, translation.status);

    // baseline = distinct keys present for the default locale per namespace
    const baseline = new Map<string, number>();
    for (const r of keysByNs) {
      if (r.localeCode === 'en') {
        baseline.set(r.namespace, (baseline.get(r.namespace) ?? 0) + r.n);
      }
    }

    const rows = [];
    for (const loc of locales) {
      for (const [ns, total] of baseline) {
        const published = keysByNs
          .filter(
            (r) => r.namespace === ns && r.localeCode === loc.code && r.status === 'published',
          )
          .reduce((a, b) => a + b.n, 0);
        rows.push({
          locale: loc.code,
          namespace: ns,
          total,
          published,
          missing: Math.max(0, total - published),
          coveragePct: total ? Math.round((published / total) * 100) : 100,
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
    const rows = await this.db
      .select({ key: translation.key, value: translation.value })
      .from(translation)
      .where(
        and(
          eq(translation.namespace, namespace),
          eq(translation.localeCode, localeCode),
          eq(translation.status, 'published'),
        ),
      );
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  async list(namespace: string, localeCode: string) {
    const src = await this.db
      .select()
      .from(translation)
      .where(and(eq(translation.namespace, namespace), eq(translation.localeCode, 'en')));
    const target = await this.db
      .select()
      .from(translation)
      .where(and(eq(translation.namespace, namespace), eq(translation.localeCode, localeCode)));
    const targetByKey = new Map(target.map((t) => [t.key, t]));
    return src.map((s) => {
      const t = targetByKey.get(s.key);
      return {
        key: s.key,
        source: s.value,
        translation: t?.value ?? null,
        status: t?.status ?? 'missing',
        outdated: !!t && t.sourceRevision !== s.sourceRevision,
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
    },
  ) {
    if (!(await this.isKnownLocale(input.localeCode))) {
      throw new AppError('validation_failed', {
        title: 'Unknown locale',
        fieldErrors: [{ path: 'localeCode', code: 'unsupported' }],
      });
    }
    const [src] = await this.db
      .select({ rev: translation.sourceRevision })
      .from(translation)
      .where(
        and(
          eq(translation.namespace, input.namespace),
          eq(translation.key, input.key),
          eq(translation.localeCode, 'en'),
        ),
      )
      .limit(1);

    const [row] = await this.db
      .insert(translation)
      .values({
        namespace: input.namespace,
        key: input.key,
        localeCode: input.localeCode,
        value: input.value,
        status: input.status ?? 'draft',
        sourceRevision: src?.rev ?? 'unknown',
        reviewedBy: input.status === 'published' ? actor.accountId : null,
        reviewedAt: input.status === 'published' ? sql`now()` : null,
      })
      .onConflictDoUpdate({
        target: [translation.namespace, translation.key, translation.localeCode],
        set: {
          value: input.value,
          status: input.status ?? 'draft',
          sourceRevision: src?.rev ?? 'unknown',
          updatedAt: sql`now()`,
        },
      })
      .returning();

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
    if ((input.status ?? 'draft') === 'published') {
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
    // block if any mandatory (legal) key is still missing — modelled: keys prefixed 'legal.'
    const rows = await this.list(namespace, localeCode);
    const missingLegal = rows.filter((r) => r.key.startsWith('legal.') && !r.translation);
    if (missingLegal.length) {
      throw new AppError('business_rule_violation', {
        title: `Cannot publish: ${missingLegal.length} mandatory legal string(s) untranslated`,
        params: { reason: 'missing_mandatory', count: missingLegal.length },
      });
    }
    await this.db
      .update(translation)
      .set({
        status: 'published',
        reviewedBy: actor.accountId,
        reviewedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(translation.namespace, namespace),
          eq(translation.localeCode, localeCode),
          eq(translation.status, 'in_review'),
        ),
      );
    await this.cache.invalidate(`i18n:${localeCode}`, { namespace });
    if (namespace.startsWith('lookup:')) {
      await this.cache.invalidate(namespace, { via: 'translation' });
    }
    await this.audit.record({
      action: 'config.translation.published',
      targetType: 'translation_namespace',
      targetId: `${namespace}:${localeCode}`,
      actor,
    });
    return this.list(namespace, localeCode);
  }
}
