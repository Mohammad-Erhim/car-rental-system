import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from './api.js';

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
  history?: Array<{
    type: string;
    at: string;
    amountDeltaMinor: number;
    note: string | null;
    actor: string;
  }>;
}

export function useOpsRentals(filter: { state?: string; locationCode?: string }) {
  const qs = new URLSearchParams();
  if (filter.state) qs.set('state', filter.state);
  if (filter.locationCode) qs.set('locationCode', filter.locationCode);
  return useQuery({
    queryKey: ['ops', 'rentals', filter],
    queryFn: ({ signal }) =>
      apiFetch<Rental[]>(`/ops/rentals${qs.toString() ? `?${qs}` : ''}`, { signal }),
  });
}

export function useAssignVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reservationReference: string) =>
      apiFetch<Rental>(`/ops/reservations/${reservationReference}/assign`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: (_data, reservationReference) => {
      void qc.invalidateQueries({ queryKey: ['ops', 'rentals'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'reservations'] });
      void qc.invalidateQueries({ queryKey: ['reservation', reservationReference] });
    },
  });
}

export function usePickup(reference: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      odometerKm: number;
      fuelPct: number;
      driverName: string;
      licenceNumber: string;
    }) => apiFetch<Rental>(`/ops/rentals/${reference}/pickup`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'rentals'] }),
  });
}

export function useReturnRental(reference: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      odometerKm: number;
      fuelPct: number;
      findings?: Array<{ area: string; description: string; chargeMinor?: number }>;
    }) =>
      apiFetch<Rental & { adjustmentMinor: number; fuelMinor: number; damageMinor: number }>(
        `/ops/rentals/${reference}/return`,
        { method: 'POST', body },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'rentals'] }),
  });
}

export function useReadiness(reference: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (passed: boolean) =>
      apiFetch<Rental>(`/ops/rentals/${reference}/readiness`, { method: 'POST', body: { passed } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'rentals'] }),
  });
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

export function useRaiseIncident(reference: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      category: 'breakdown' | 'accident' | 'damage' | 'other';
      note?: string;
      immobilised?: boolean;
      replacementUnitId?: string;
    }) => apiFetch<Rental>(`/ops/rentals/${reference}/incident`, { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ops', 'rentals'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'fleet-units'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'fleet-blocks'] });
    },
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rental'] });
    },
  });
}
