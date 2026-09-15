import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../api-fetch';

/**
 * Reservation-detail / rental / invoice hooks for the authed customer surface. These are
 * app-local by design, the same way `apps/site/src/lib/customer-hooks.ts` keeps them app-local
 * (its own doc comment: only profile/drivers/discovery/booking moved to `@carrental/client/react`
 * because the ops dashboard also needs those — nothing here is used outside a customer surface,
 * so mirroring the shapes 1:1 is the right amount of sharing without pulling `@carrental/ui` in
 * as a transitive peer of a package this app doesn't otherwise need).
 */

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

/** Mirrors `@carrental/client/react`'s `InvoiceView` (kept local — see file doc comment). */
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
