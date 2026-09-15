import type {
  AvailabilitySearchResponse,
  ConfirmBookingRequest,
  Quote,
  Reservation,
  VehicleCategory,
} from '@carrental/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';

import { apiFetch } from '../api-fetch';

/**
 * Public discovery / checkout hooks — mirrors `@carrental/client/react`'s `use-discovery.ts`
 * hook-for-hook (same query keys, same endpoints, same shapes) so the two clients never drift.
 * Reimplemented (not imported) only because it's hard-wired to the browser `apiFetch`; see
 * `apps/mobile/src/lib/api/api-fetch.ts`'s doc comment.
 */

export interface Location {
  id: string;
  code: string;
  name: string;
  timezone: string;
  afterHoursReturn: boolean;
  regularHours: Array<{ day: number; open?: string; close?: string; closed?: boolean }>;
  /** Decimal-degree strings (nullable — not every location has been geocoded yet). Mobile-only
   *  use so far: sorting the location picker by distance from the device. */
  latitude: string | null;
  longitude: string | null;
}

export function useLocations() {
  return useQuery({
    queryKey: ['config', 'locations'],
    queryFn: ({ signal }) => apiFetch<Location[]>('/config/locations', { signal, anonymous: true }),
    staleTime: 5 * 60 * 1000,
  });
}

/** `GET /catalogue/categories` — the full published fleet list (site's "browse by category" /
 *  `apps/mobile`'s fleet tab). Public + cacheable. */
export function useCategories(locale?: string) {
  return useQuery({
    queryKey: ['catalogue', 'categories', locale],
    queryFn: ({ signal }) =>
      apiFetch<VehicleCategory[]>(
        `/catalogue/categories${locale ? `?locale=${encodeURIComponent(locale)}` : ''}`,
        { signal, anonymous: true },
      ),
    staleTime: 2 * 60 * 1000,
  });
}

export function useCategory(code: string | null, locale?: string) {
  return useQuery({
    queryKey: ['catalogue', 'category', code, locale],
    queryFn: ({ signal }) =>
      apiFetch<VehicleCategory>(
        `/catalogue/categories/${code}${locale ? `?locale=${encodeURIComponent(locale)}` : ''}`,
        { signal, anonymous: true },
      ),
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
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
}

export function useCreateQuote() {
  return useMutation({
    mutationFn: (
      body: SearchArgs & {
        categoryCode: string;
        hold?: boolean;
        holderKey?: string;
        unitId?: string;
      },
    ) => apiFetch<Quote>('/discovery/quote', { method: 'POST', body, anonymous: true }),
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

export interface AvailableUnit {
  id: string;
  make: string | null;
  model: string | null;
  year: string | null;
  colour: string | null;
  imageUrl: string | null;
}

/** SCREEN-CUS-003b — the specific cars pickable for a class + location + window. */
export function useAvailableUnits(
  categoryCode: string,
  args: { locationCode: string; pickupAt: string; returnAt: string } | null,
) {
  return useQuery({
    queryKey: ['catalogue', 'category-units', categoryCode, args],
    queryFn: ({ signal }) =>
      apiFetch<AvailableUnit[]>(
        `/catalogue/categories/${categoryCode}/units?${new URLSearchParams({
          locationCode: args!.locationCode,
          pickupAt: args!.pickupAt,
          returnAt: args!.returnAt,
        })}`,
        { signal, anonymous: true },
      ),
    enabled: !!args,
    staleTime: 0,
  });
}

/** SCREEN-CUS-005 — extras & protection a customer may add for a category + pickup location. */
export interface CatalogueProduct {
  id: string;
  code: string;
  name: string;
  kind: 'extra' | 'protection';
  unitPriceMinor: number;
  currency: string;
  pricingUnit: 'per_rental' | 'per_day';
  taxable: boolean;
  maxQuantity: number;
}

export function useAvailableProducts(categoryCode: string | null, locationCode: string | null) {
  return useQuery({
    queryKey: ['catalogue', 'products', categoryCode, locationCode],
    enabled: !!categoryCode && !!locationCode,
    queryFn: ({ signal }) =>
      apiFetch<CatalogueProduct[]>(
        `/catalogue/products?category=${encodeURIComponent(categoryCode!)}&location=${encodeURIComponent(locationCode!)}`,
        { signal, anonymous: true },
      ),
  });
}

export interface ReservationResult extends Reservation {
  guestAccessToken: string | null;
  payment: { brand: string | null; last4: string | null; alreadyProcessed: boolean };
  heldUnitPinned: boolean;
}

export function useConfirmBooking() {
  return useMutation({
    mutationFn: (body: ConfirmBookingRequest) =>
      apiFetch<ReservationResult>('/bookings/confirm', { method: 'POST', body }),
  });
}

export function useMyReservations(enabled: boolean) {
  return useQuery({
    queryKey: ['booking', 'mine'],
    queryFn: ({ signal }) =>
      apiFetch<
        Array<{
          reference: string;
          state: string;
          categoryCode: string;
          pickupLocationCode: string;
          pickupAt: string;
          returnAt: string;
          totalMinor: number;
          currency: string;
        }>
      >('/bookings/mine', { signal }),
    enabled,
  });
}

/** The org's live payment provider mode — read anonymously so checkout can decide, before
 *  rendering the payment step, whether to show the simulator's test-card picker or the real
 *  Stripe payment sheet. Never cached across a long session (a dashboard switch must be
 *  reflected on the next checkout load). */
export interface PaymentMode {
  driver: 'simulator' | 'stripe_test' | 'stripe_live';
  publishableKey: string | null;
}

export function usePaymentMode() {
  return useQuery({
    queryKey: ['payments', 'mode'],
    queryFn: ({ signal }) =>
      apiFetch<PaymentMode>('/ops/payments/mode', { signal, anonymous: true }),
    staleTime: 60 * 1000,
  });
}

/** Format integer minor units as a localized currency string (SRS-I18N). */
export function formatMinor(amountMinor: number, currency: string, locale = 'en'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}
