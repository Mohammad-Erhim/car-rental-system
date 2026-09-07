import type { AvailabilitySearchResponse, Quote, VehicleCategory } from '@carrental/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';

import { apiFetch } from './api.js';

export interface Location {
  id: string;
  code: string;
  name: string;
  timezone: string;
  afterHoursReturn: boolean;
  regularHours: Array<{ day: number; open?: string; close?: string; closed?: boolean }>;
}

export function useLocations() {
  return useQuery({
    queryKey: ['config', 'locations'],
    queryFn: ({ signal }) => apiFetch<Location[]>('/config/locations', { signal, anonymous: true }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCategory(code: string | null) {
  return useQuery({
    queryKey: ['catalogue', 'category', code],
    queryFn: ({ signal }) =>
      apiFetch<VehicleCategory>(`/catalogue/categories/${code}`, { signal, anonymous: true }),
    enabled: !!code,
  });
}

export interface SearchArgs {
  pickupLocationCode: string;
  returnLocationCode?: string;
  pickupAt: string;
  returnAt: string;
  categoryCode?: string;
}

export function useAvailabilitySearch(args: SearchArgs | null) {
  return useQuery({
    queryKey: ['discovery', 'search', args],
    queryFn: ({ signal }) =>
      apiFetch<AvailabilitySearchResponse>('/discovery/search', {
        method: 'POST',
        body: args ?? {},
        anonymous: true,
        signal,
      }),
    enabled: !!args,
    // availability + price are live — never serve a stale result when the screen is re-entered
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
}

export function useCreateQuote() {
  return useMutation({
    mutationFn: (body: SearchArgs & { categoryCode: string; hold?: boolean; holderKey?: string }) =>
      apiFetch<Quote>('/discovery/quote', { method: 'POST', body, anonymous: true }),
  });
}

export function useQuoteByRef(reference: string | null) {
  return useQuery({
    queryKey: ['discovery', 'quote', reference],
    queryFn: ({ signal }) =>
      apiFetch<Quote>(`/discovery/quotes/${reference}`, { signal, anonymous: true }),
    enabled: !!reference,
  });
}

/** Format integer minor units as a currency string for display (SRS-I18N — transaction currency). */
export function formatMinor(amountMinor: number, currency: string, locale = 'en'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}
