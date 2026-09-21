import type { AdminCurrenciesResponse, PublicCurrency } from '@carrental/contracts';
import { SUPPORTED_CURRENCIES, getCurrency, minorUnitDigits } from '@carrental/i18n';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import type { Actor } from '../../common/auth/types';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { lookupValue } from '../../database/schema/lookup';

import { LocaleRepo } from './locale.repo';
import { LookupService } from './lookup.service';

const TYPE = 'currency';

/** The name of a currency in a locale, from the runtime's own ICU data — so a currency added
 *  today is already named in French, Arabic or whatever other language is enabled, with no
 *  translation file to maintain. `undefined` when the runtime has no name for it. */
function icuName(code: string, locale: string): string | undefined {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'currency' }).of(code);
    return name && name !== code ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Which currencies the business sells in (DEC-036). Storage is the `currency` reference-data list
 * — so rate plans, extras and every existing `assertLookupCode('currency', …)` keep working
 * untouched — and this service is the one place that knows the extra rules: only catalogue
 * currencies, exactly one default that is always enabled, and a disabled currency stays valid
 * for reservations already made in it.
 */
@Injectable()
export class CurrencyService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly lookups: LookupService,
    private readonly locales: LocaleRepo,
  ) {}

  /** Enabled currency codes, default first — one cheap query, safe to call per request. */
  async enabledCodes(): Promise<string[]> {
    const rows = await this.db
      .select({ code: lookupValue.code, isDefault: lookupValue.isDefault })
      .from(lookupValue)
      .where(
        and(
          eq(lookupValue.typeCode, TYPE),
          eq(lookupValue.scopeKey, 'global'),
          eq(lookupValue.isActive, true),
        ),
      )
      .orderBy(sql`${lookupValue.isDefault} desc`, lookupValue.sortOrder, lookupValue.code);
    return rows.map((r) => r.code);
  }

  /**
   * The default currency: the reference-data value flagged default, else the organisation's
   * legacy `default_currency` if that is still enabled, else the first enabled one. Never empty
   * — a deployment with nothing enabled yet still answers with the organisation's currency.
   */
  async defaultCode(): Promise<string> {
    const resolved = await this.lookups.resolveDefaultCurrency();
    const enabled = await this.enabledCodes();
    if (resolved && (enabled.length === 0 || enabled.includes(resolved))) return resolved;
    return enabled[0] ?? resolved ?? 'USD';
  }

  /** Enabled currencies with localised names, in display order — the switcher's raw material. */
  async listEnabled(locale = 'en'): Promise<PublicCurrency[]> {
    const [{ values }, defaultCode] = await Promise.all([
      this.lookups.getValues(TYPE, { locale }),
      this.defaultCode(),
    ]);
    return values
      .map((v) => ({
        code: v.code,
        label: v.label,
        digits: minorUnitDigits(v.code),
        isDefault: v.code === defaultCode,
      }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  }

  /** The operator's whole list — enabled and disabled — with what depends on each. */
  async adminOverview(locale = 'en'): Promise<AdminCurrenciesResponse> {
    const { values } = await this.lookups.getValues(TYPE, { locale, includeInactive: true });
    const defaultCode = await this.defaultCode();
    const currencies = await Promise.all(
      values.map(async (v) => {
        const usage = await this.lookups.usage(TYPE, v.code);
        const count = (surface: string) =>
          usage.consumers.find((c) => c.surface === surface)?.count ?? 0;
        return {
          id: v.id,
          code: v.code,
          label: v.label,
          digits: minorUnitDigits(v.code),
          isDefault: v.code === defaultCode,
          isActive: v.isActive,
          version: v.version,
          usage: { ratePlans: count('pricing.rate_plan'), products: count('catalogue.product') },
        };
      }),
    );
    const have = new Set(values.map((v) => v.code));
    return {
      defaultCode,
      currencies: currencies.sort(
        (a, b) =>
          Number(b.isDefault) - Number(a.isDefault) ||
          Number(b.isActive) - Number(a.isActive) ||
          a.code.localeCompare(b.code),
      ),
      available: SUPPORTED_CURRENCIES.filter((c) => !have.has(c.code)).map((c) => ({
        code: c.code,
        name: c.name,
        digits: c.digits,
      })),
    };
  }

  /** Enable a catalogue currency — creating it, or bringing a disabled one back. Idempotent. */
  async enable(actor: Actor, code: string, opts: { makeDefault?: boolean } = {}) {
    const def = getCurrency(code);
    if (!def) {
      throw AppError.validation(
        [{ path: 'code', code: 'unsupported', params: { type: TYPE } }],
        `"${code}" is not a supported currency`,
      );
    }
    const { values } = await this.lookups.getValues(TYPE, { includeInactive: true });
    const existing = values.find((v) => v.code === def.code);
    if (!existing) {
      // named in every enabled language up front; the operator can still edit a label later
      const translations: Record<string, string> = {};
      for (const loc of await this.locales.activeCodes({ includeTestOnly: true })) {
        if (loc === 'en') continue;
        const name = icuName(def.code, loc);
        if (name) translations[loc] = name;
      }
      await this.lookups.createValue(actor, TYPE, {
        code: def.code,
        label: def.name,
        sortOrder: values.length,
        isDefault: false,
        translations,
      });
    } else if (!existing.isActive) {
      await this.lookups.setActive(actor, TYPE, existing.id, true);
    }
    if (opts.makeDefault) await this.setDefault(actor, def.code);
    return this.adminOverview();
  }

  async setDefault(actor: Actor, code: string) {
    const { values } = await this.lookups.getValues(TYPE, { includeInactive: true });
    const row = values.find((v) => v.code === code.toUpperCase());
    if (!row) throw AppError.notFound('currency');
    if (!row.isActive) {
      throw AppError.businessRule('Enable a currency before making it the default', {
        reason: 'currency_not_enabled',
      });
    }
    if (!row.isDefault) {
      await this.lookups.updateValue(actor, TYPE, row.id, { isDefault: true }, row.version);
    }
    return this.adminOverview();
  }

  /** Disable a currency for *new* prices. Reservations already made in it are untouched.
   *  `force` confirms disabling one that live price lists or extras still use. */
  async disable(actor: Actor, code: string, opts: { force?: boolean } = {}) {
    const { values } = await this.lookups.getValues(TYPE, { includeInactive: true });
    const row = values.find((v) => v.code === code.toUpperCase());
    if (!row) throw AppError.notFound('currency');
    if (row.isActive) await this.lookups.setActive(actor, TYPE, row.id, false, opts);
    return this.adminOverview();
  }
}
