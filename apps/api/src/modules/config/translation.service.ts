import { SUPPORTED_LOCALE_CODES } from '@carrental/i18n';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import { CacheBus } from '../../common/cache/cache-bus';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { locale, translation } from '../../database/schema/i18n';

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
    if (!SUPPORTED_LOCALE_CODES.includes(input.localeCode)) {
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
    if (!/^[a-z]{2}(-[a-z0-9]{2,8})*$/i.test(code)) {
      throw new AppError('validation_failed', {
        title: 'Invalid BCP-47 locale code',
        fieldErrors: [{ path: 'code', code: 'invalid' }],
      });
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

  async setLocaleActive(actor: Actor, code: string, isActive: boolean) {
    const [row] = await this.db.select().from(locale).where(eq(locale.code, code)).limit(1);
    if (!row) throw AppError.notFound('locale');
    if (!isActive && row.isDefault) {
      throw AppError.businessRule('The default locale cannot be deactivated', {
        reason: 'is_default',
      });
    }
    await this.db
      .update(locale)
      .set({ isActive, updatedAt: sql`now()` })
      .where(eq(locale.code, code));
    await this.audit.record({
      action: isActive ? 'config.locale.activated' : 'config.locale.deactivated',
      targetType: 'locale',
      targetId: row.id,
      actor,
    });
    await this.cache.invalidate('i18n:locales', {});
    return { code, isActive };
  }

  async setDefaultLocale(actor: Actor, code: string) {
    const [row] = await this.db.select().from(locale).where(eq(locale.code, code)).limit(1);
    if (!row) throw AppError.notFound('locale');
    await this.db.transaction(async (tx) => {
      await tx.update(locale).set({ isDefault: false }).where(ne(locale.code, code));
      await tx
        .update(locale)
        .set({ isDefault: true, isActive: true, updatedAt: sql`now()` })
        .where(eq(locale.code, code));
    });
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
    await this.audit.record({
      action: 'config.translation.published',
      targetType: 'translation_namespace',
      targetId: `${namespace}:${localeCode}`,
      actor,
    });
    return this.list(namespace, localeCode);
  }
}
