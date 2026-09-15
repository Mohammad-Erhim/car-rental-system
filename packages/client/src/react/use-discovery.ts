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
 * Public discovery / checkout hooks (SCREEN-CUS-004..009) — shared between the customer site,
 * which is the only surface that actually renders booking flows today, and the ops dashboard,
 * which re-exports `useLocations`/`formatMinor` for its own location pickers and money
 * formatting. Previously duplicated byte-for-byte between `apps/web/src/lib/discovery-hooks.ts`
 * and `apps/site/src/lib/customer-hooks.ts` (CLAUDE.md: "never solve the same problem twice").
 */

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

/** `locale` is optional — the customer site passes its active locale so category copy comes back
 *  translated; the ops dashboard (single-locale admin views) omits it. */
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
    // availability + price are live — never serve a stale result when the screen is re-entered
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
        /** SCREEN-CUS-003b — the specific car the customer picked before checkout, if any. */
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

export interface ReservationResult extends Reservation {
  guestAccessToken: string | null;
  payment: { brand: string | null; last4: string | null; alreadyProcessed: boolean };
  heldUnitPinned: boolean;
}

export function useConfirmBooking() {
  return useMutation({
    // sends the bearer when signed in (ties the reservation to the account); works without one
    // for guest checkout — the endpoint is @OptionalAuth().
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

/** Format integer minor units as a localized currency string (SRS-I18N — transaction currency). */
export function formatMinor(amountMinor: number, currency: string, locale = 'en'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * A staff- or customer-facing invoice/credit-note view (FR-PAY formal invoicing). Byte-identical
 * between `apps/web/src/lib/invoice-hooks.ts` (ops: `/ops/reservations/:ref/invoices`) and
 * `apps/site/src/lib/customer-hooks.ts` (customer: `/reservations/:ref/invoices`) — only the type
 * lives here since the two fetch hooks stay app-local (different endpoints/permissions).
 */
export interface InvoiceView {
  number: string;
  docVersion: number;
  kind: 'invoice' | 'credit_note';
  previousNumber: string | null;
  reservationReference: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  reason: string | null;
  issuedAt: string;
  snapshot: {
    org: {
      tradingName: string;
      legalName: string;
      taxId: string;
      registeredAddress: Record<string, string>;
    };
    customer: { fullName: string | null; email: string | null };
    trip: {
      categoryCode: string;
      pickupLocationCode: string;
      returnLocationCode: string;
      pickupAt: string;
      returnAt: string;
      pickedUnit: { make: string | null; model: string | null; colour: string | null } | null;
    };
    lines: Array<{
      kind: string;
      code: string;
      label: string;
      quantity: number;
      unitMinor: number;
      amountMinor: number;
    }>;
  };
}
