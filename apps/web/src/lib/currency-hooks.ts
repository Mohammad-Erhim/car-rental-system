import { apiFetch } from '@carrental/client';
import type { AdminCurrenciesResponse } from '@carrental/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** The operator's currency list (Settings → Currencies, DEC-036). */
export const CURRENCIES_KEY = ['ops', 'currencies'] as const;

export function useCurrencyOverview(locale: string) {
  return useQuery({
    queryKey: [...CURRENCIES_KEY, locale],
    queryFn: ({ signal }) =>
      apiFetch<AdminCurrenciesResponse>(
        `/ops/config/currencies?locale=${encodeURIComponent(locale)}`,
        { signal },
      ),
  });
}

/**
 * Add / default / disable. Every success refreshes everything that lists currencies — this page,
 * the currency pickers on rate plans and extras (reference data), and the public switcher's list —
 * so a change is visible everywhere without a reload.
 */
export function useCurrencyActions() {
  const qc = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: CURRENCIES_KEY }),
      qc.invalidateQueries({ queryKey: ['reference-data'] }),
      qc.invalidateQueries({ queryKey: ['discovery', 'currencies'] }),
    ]);
  };

  const enable = useMutation({
    mutationFn: (body: { code: string; makeDefault?: boolean }) =>
      apiFetch<AdminCurrenciesResponse>('/ops/config/currencies', { method: 'POST', body }),
    onSuccess: refresh,
  });
  const setDefault = useMutation({
    mutationFn: (code: string) =>
      apiFetch<AdminCurrenciesResponse>(`/ops/config/currencies/${code}/default`, {
        method: 'POST',
      }),
    onSuccess: refresh,
  });
  const disable = useMutation({
    mutationFn: (input: { code: string; force?: boolean }) =>
      apiFetch<AdminCurrenciesResponse>(
        `/ops/config/currencies/${input.code}/disable${input.force ? '?force=true' : ''}`,
        { method: 'POST' },
      ),
    onSuccess: refresh,
  });
  return { enable, setDefault, disable };
}
