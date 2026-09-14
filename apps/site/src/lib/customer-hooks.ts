/**
 * React Query hooks for the authed customer surface on `apps/site` — profile, saved drivers,
 * privacy requests, trips (reservations + rental), and the checkout quote/confirm calls.
 * Ported from the customer-relevant parts of `apps/web/src/lib/{api-hooks,discovery-hooks,
 * reservation-hooks,rental-hooks}.ts` (ops-only hooks left behind).
 */
'use client';

import { apiFetch } from '@carrental/client';
import type {
  AddDriverRequest,
  AvailabilitySearchResponse,
  ConfirmBookingRequest,
  Driver,
  PrivacyRequest,
  Profile,
  Quote,
  Reservation,
  VehicleCategory,
} from '@carrental/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useLocale } from './nav';

// ---- profile (SCREEN-CUS-011/012) ----

export function useProfile(enabled: boolean) {
  return useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => apiFetch<Profile>('/auth/profile', { signal }),
    enabled,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { patch: Record<string, unknown>; version: number }) =>
      apiFetch<Profile>('/auth/profile', {
        method: 'POST',
        body: input.patch,
        ifMatch: input.version,
      }),
    onSuccess: (data) => qc.setQueryData(['profile'], data),
  });
}

// ---- saved drivers (SCREEN-CUS-013) ----

export function useDrivers(enabled: boolean) {
  return useQuery({
    queryKey: ['drivers'],
    queryFn: ({ signal }) => apiFetch<Driver[]>('/auth/drivers', { signal }),
    enabled,
  });
}

export function useAddDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddDriverRequest) =>
      apiFetch<Driver>('/auth/drivers', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });
}

export function useRemoveDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/auth/drivers/${id}/remove`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });
}

// ---- privacy / account closure (SCREEN-CUS-024) ----

export function useDataRequests(enabled: boolean) {
  return useQuery({
    queryKey: ['data-requests'],
    queryFn: ({ signal }) => apiFetch<PrivacyRequest[]>('/auth/data-requests', { signal }),
    enabled,
  });
}

export function useCreateDataRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: 'access' | 'correction' | 'closure'; detail?: string }) =>
      apiFetch<PrivacyRequest>('/auth/data-requests', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data-requests'] }),
  });
}

export function useCancelDataRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/auth/data-requests/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data-requests'] }),
  });
}

// ---- discovery / checkout (SCREEN-CUS-004..009) ----

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

/**
 * The org's live payment provider mode (SCREEN-CUS-004/006, STAGE-003) — read anonymously so
 * checkout can decide, before rendering the payment step, whether to show the simulator's test
 * card picker or a real Stripe Payment Element. Never cached across a long session: a dashboard
 * switch (e.g. simulator -> stripe_live) must be reflected on the very next checkout load.
 */
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

export function useCategory(code: string | null) {
  const locale = useLocale();
  return useQuery({
    queryKey: ['catalogue', 'category', code, locale],
    queryFn: ({ signal }) =>
      apiFetch<VehicleCategory>(
        `/catalogue/categories/${code}?locale=${encodeURIComponent(locale)}`,
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

/** SCREEN-CUS-003b — the specific cars a customer can pick for a class + location + window,
 *  before checkout. A soft, best-effort list (see the backend's own doc comment); re-fetched
 *  fresh whenever the trip window changes. */
export interface AvailableUnit {
  id: string;
  make: string | null;
  model: string | null;
  year: string | null;
  colour: string | null;
  imageUrl: string | null;
}

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

// ---- reservation detail / changes (SCREEN-CUS-017..020) ----

export interface ReservationDetail {
  reference: string;
  state: string;
  channel: string;
  categoryCode: string;
  pickupLocationCode: string;
  returnLocationCode: string;
  pickupAt: string;
  returnAt: string;
  durationHours: number;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  refundedMinor: number;
  paymentBrand: string | null;
  paymentLast4: string | null;
  createdAt: string;
  lines: Array<{
    kind: string;
    code: string;
    label: string;
    quantity: number;
    unitMinor: number;
    amountMinor: number;
  }>;
  drivers: Array<{ role: string; fullName: string; email: string | null }>;
  cancellable: boolean;
  modifiable: boolean;
}

export interface ReservationEvent {
  type: string;
  at: string;
  reasonCode: string | null;
  note: string | null;
  amountDeltaMinor: number;
  actor: string;
}

export function useReservationDetail(reference: string | null) {
  return useQuery({
    queryKey: ['reservation', reference],
    queryFn: ({ signal }) => apiFetch<ReservationDetail>(`/reservations/${reference}`, { signal }),
    enabled: !!reference,
  });
}

export function useReservationHistory(reference: string | null) {
  return useQuery({
    queryKey: ['reservation', reference, 'history'],
    queryFn: ({ signal }) =>
      apiFetch<ReservationEvent[]>(`/reservations/${reference}/history`, { signal }),
    enabled: !!reference,
  });
}

export function useCancelReservation(reference: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { reasonCode?: string; note?: string }) =>
      apiFetch<ReservationDetail & { refundMinor: number; feeMinor: number }>(
        `/reservations/${reference}/cancel`,
        { method: 'POST', body },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reservation', reference] });
      void qc.invalidateQueries({ queryKey: ['booking', 'mine'] });
    },
  });
}

export function useModifyReservation(reference: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      pickupAt?: string;
      returnAt?: string;
      categoryCode?: string;
      paymentToken?: string;
      reasonCode?: string;
    }) =>
      apiFetch<ReservationDetail & { deltaMinor: number }>(`/reservations/${reference}/modify`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservation', reference] }),
  });
}

// ---- rental (customer view, SCREEN-CUS-021/022) ----

export interface Rental {
  reference: string;
  reservationReference: string;
  state: string;
  unitId: string | null;
  pickupLocationCode: string;
  returnLocationCode: string;
  scheduledPickupAt: string;
  scheduledReturnAt: string;
  pickedUpAt: string | null;
  returnedAt: string | null;
  odometerOutKm: number | null;
  fuelOutPct: number | null;
  currency: string;
  settlementMinor: number;
  agreementVersion: string | null;
}

export function useMyRental(reservationReference: string | null) {
  return useQuery({
    queryKey: ['rental', 'for-reservation', reservationReference],
    queryFn: async ({ signal }) => {
      const all = await apiFetch<Rental[]>('/rentals/mine', { signal });
      return all.find((r) => r.reservationReference === reservationReference) ?? null;
    },
    enabled: !!reservationReference,
  });
}

export function useExtendRental(reference: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { newReturnAt: string; paymentToken?: string }) =>
      apiFetch<Rental & { deltaMinor: number }>(`/rentals/${reference}/extend`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rental'] }),
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
