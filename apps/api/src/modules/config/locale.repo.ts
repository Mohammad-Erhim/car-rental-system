import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { locale } from '../../database/schema/i18n';

export type LocaleRow = typeof locale.$inferSelect;

/**
 * Data access for the `locale` aggregate — specifically the *runtime* fallback-chain resolution
 * (DEC-024) that was hand-built once in `NotifyService` and, separately, never applied at all in
 * `LookupService` (which used `@carrental/i18n`'s compile-time `fallbackChain()` instead — a
 * dashboard-added locale's own configured `fallback_chain` was silently ignored there). Both now
 * go through this one seam, so a locale-fallback fix applies everywhere at once.
 */
@Injectable()
export class LocaleRepo {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Active locale codes, ordered for display. `includeTestOnly` defaults to false — most
   *  content-authoring surfaces (templates, translations) don't want DEC-020 test locales. */
  async activeCodes(opts: { includeTestOnly?: boolean } = {}): Promise<string[]> {
    const rows = await this.db
      .select({ code: locale.code, testOnly: locale.testOnly })
      .from(locale)
      .where(eq(locale.isActive, true))
      .orderBy(asc(locale.sortOrder));
    return rows.filter((r) => opts.includeTestOnly || !r.testOnly).map((r) => r.code);
  }

  /**
   * `[code, ...its configured fallback chain, the runtime default]`, deduped — the *runtime*,
   * DB-driven equivalent of `@carrental/i18n`'s static `fallbackChain()`. A locale added from
   * `/ops/config/languages` with a custom chain (e.g. `fi` falling back to `fr` before `en`) is
   * honored here; the static helper would silently collapse any code outside its compiled-in
   * three straight to `en`. Falls back to `[code, 'en']` if the locale is unknown/inactive or the
   * table is unreachable, so a caller never hard-fails on this lookup.
   */
  async fallbackChain(code: string): Promise<string[]> {
    const rows = await this.db
      .select({
        code: locale.code,
        fallbackChain: locale.fallbackChain,
        isDefault: locale.isDefault,
      })
      .from(locale)
      .where(eq(locale.isActive, true));
    const def = rows.find((r) => r.code === code) ?? rows.find((r) => r.isDefault);
    const defaultCode = rows.find((r) => r.isDefault)?.code ?? 'en';
    if (!def) return [...new Set([code, defaultCode])];
    return [...new Set([def.code, ...def.fallbackChain, defaultCode])];
  }
}
