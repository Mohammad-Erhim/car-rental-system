'use client';

import { useCurrencies } from '@carrental/client/react';
import { pickCurrency } from '@carrental/i18n';
import { useI18n } from '@carrental/i18n/react';
import { useQueryClient } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { persistCurrencyChoice, usePreferredCurrency } from '../lib/currency';

/**
 * Which currency prices are shown in (DEC-036). The list comes from the API — the currencies the
 * business has enabled *and* has prices for — so adding or removing one in the dashboard changes
 * this with no redeploy, and a currency with nothing to buy in it is never offered. Hidden while
 * there is only one to choose from. The choice is a cookie; `router.refresh()` re-renders the
 * server-rendered pages that read it, and the cache is dropped so client-side prices refetch.
 */
export function CurrencySwitcher() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = useCurrencies(locale);
  const stored = usePreferredCurrency();

  if (!data || data.currencies.length < 2) return null;
  const current = pickCurrency(
    stored,
    data.currencies.map((c) => c.code),
    data.defaultCode,
  );

  function change(next: string) {
    persistCurrencyChoice(next);
    void queryClient.invalidateQueries({ queryKey: ['discovery'] });
    router.refresh();
  }

  return (
    <label className="flex items-center gap-1 text-sm">
      <Coins className="size-4 text-ink-muted" aria-hidden="true" />
      <span className="sr-only">{t('currency.switcher.label')}</span>
      <select
        value={current}
        onChange={(e) => change(e.target.value)}
        className="rounded-md border border-hairline bg-surface py-1 pe-6 ps-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        aria-label={t('currency.switcher.label')}
        data-testid="currency-switcher"
      >
        {data.currencies.map((c) => (
          <option key={c.code} value={c.code} className="bg-surface text-ink">
            {c.code}
          </option>
        ))}
      </select>
    </label>
  );
}
