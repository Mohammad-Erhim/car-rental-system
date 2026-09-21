/**
 * React Query hooks for the authed customer surface on `apps/site` — trips (reservations +
 * rental) and the checkout quote/confirm calls that stay site-specific. Profile/drivers/
 * data-request hooks and the discovery/booking/invoice hooks used to be duplicated here from
 * `apps/web/src/lib/{api-hooks,discovery-hooks,invoice-hooks}.ts` — they now live in
 * `@carrental/client/react` and are re-exported below so existing imports keep working.
 */
'use client';

import { apiFetch } from '@carrental/client';
import type { InvoiceView } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
export {
  useProfile,
  useUpdateProfile,
  useDrivers,
  useAddDriver,
  useRemoveDriver,
  useDataRequests,
  useCreateDataRequest,
  useDataRequestExport,
  useCancelDataRequest,
  useLocations,
  useCategory,
  useAvailabilitySearch,
  useCreateQuote,
  useQuoteByRef,
  useConfirmBooking,
  useMyReservations,
  formatMinor,
  useCurrencies,
  type Location,
  type SearchArgs,
  type ReservationResult,
  type InvoiceView,
} from '@carrental/client/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

export function useAvailableProducts(
  categoryCode: string | null,
  locationCode: string | null,
  currency: string | null = null,
) {
  // extra names in the visitor's language where the dashboard has a translation (DEC-037)
  const { locale } = useI18n();
  return useQuery({
    queryKey: ['catalogue', 'products', categoryCode, locationCode, currency, locale],
    enabled: !!categoryCode && !!locationCode,
    queryFn: ({ signal }) =>
      apiFetch<CatalogueProduct[]>(
        `/catalogue/products?category=${encodeURIComponent(categoryCode!)}&location=${encodeURIComponent(locationCode!)}${currency ? `&currency=${encodeURIComponent(currency)}` : ''}&locale=${encodeURIComponent(locale)}`,
        { signal, anonymous: true },
      ),
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
  /** SCREEN-CUS-003b — the specific car picked before checkout, if any (honored best-effort at
   *  assign time; may differ from the car actually assigned if it stopped being viable). */
  pickedUnit: {
    id: string;
    plate: string;
    make: string | null;
    model: string | null;
    colour: string | null;
  } | null;
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

export function useReservationInvoices(reference: string | null) {
  return useQuery({
    queryKey: ['reservation', reference, 'invoices'],
    queryFn: ({ signal }) =>
      apiFetch<InvoiceView[]>(`/reservations/${reference}/invoices`, { signal }),
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
