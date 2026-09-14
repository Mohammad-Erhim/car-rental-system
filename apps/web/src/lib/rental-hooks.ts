import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  /** the readiness check's outcome (FR-RNT-013) — `null` until it's been run once; a `closed`
   *  rental's own `state` never changes when this runs, so this is the only signal that it has */
  readinessOutcome: 'passed' | 'failed' | null;
  history?: Array<{
    type: string;
    at: string;
    amountDeltaMinor: number;
    note: string | null;
    actor: string;
  }>;
}

export interface RentalBoardRow extends Rental {
  overdue: boolean;
  plate: string | null;
  vehicle: string | null;
  categoryCode: string | null;
  driverName: string | null;
  customerName: string | null;
}

export interface RentalBoardList {
  count: number;
  total: number;
  truncated: boolean;
  results: RentalBoardRow[];
}

export function useOpsRentals(filter: {
  state?: string;
  locationCode?: string;
  flow?: 'pickup' | 'return';
  from?: string;
  to?: string;
}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v) qs.set(k, v);
  return useQuery({
    queryKey: ['ops', 'rentals', filter],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch<RentalBoardList>(`/ops/rentals${qs.toString() ? `?${qs}` : ''}`, { signal }),
  });
}

/** Every rental lifecycle change also moves a dashboard KPI (pickups today, fleet readiness…). */
function useRentalInvalidate() {
  const qc = useQueryClient();
  return (extra?: () => void) => {
    void qc.invalidateQueries({ queryKey: ['ops', 'rentals'] });
    void qc.invalidateQueries({ queryKey: ['ops', 'dashboard'] });
    extra?.();
  };
}

export function useAssignVehicle() {
  const qc = useQueryClient();
  const invalidate = useRentalInvalidate();
  return useMutation({
    mutationFn: (input: string | { reference: string; unitId?: string }) => {
      const { reference, unitId } =
        typeof input === 'string' ? { reference: input, unitId: undefined } : input;
      return apiFetch<Rental>(`/ops/reservations/${reference}/assign`, {
        method: 'POST',
        body: unitId ? { unitId } : {},
      });
    },
    onSuccess: (_data, input) => {
      const reference = typeof input === 'string' ? input : input.reference;
      invalidate(() => {
        void qc.invalidateQueries({ queryKey: ['ops', 'reservations'] });
        void qc.invalidateQueries({ queryKey: ['reservation', reference] });
      });
    },
  });
}

export function usePickup(reference: string) {
  const invalidate = useRentalInvalidate();
  return useMutation({
    mutationFn: (body: {
      odometerKm: number;
      fuelPct: number;
      driverName: string;
      licenceNumber: string;
    }) => apiFetch<Rental>(`/ops/rentals/${reference}/pickup`, { method: 'POST', body }),
    onSuccess: () => invalidate(),
  });
}

export function useReturnRental(reference: string) {
  const invalidate = useRentalInvalidate();
  return useMutation({
    mutationFn: (body: {
      odometerKm: number;
      fuelPct: number;
      findings?: Array<{ area: string; description: string; chargeMinor?: number }>;
    }) =>
      apiFetch<
        Rental & {
          adjustmentMinor: number;
          fuelMinor: number;
          damageMinor: number;
          settlementCollected: boolean;
        }
      >(`/ops/rentals/${reference}/return`, { method: 'POST', body }),
    onSuccess: () => invalidate(),
  });
}

export interface RentalDetail extends Rental {
  odometerInKm: number | null;
  fuelInPct: number | null;
  plate: string | null;
  vehicle: string | null;
  categoryCode: string | null;
  driverName: string | null;
  customerName: string | null;
  findings: Array<{
    area: string;
    severity: string;
    description: string;
    chargeMinor: number;
  }>;
  history: NonNullable<Rental['history']>;
  /** the car the customer picked before checkout, only present here when it differs from what's
   *  actually assigned (e.g. it stopped being viable and assign() fell back to another car). */
  pickedUnit: { id: string; plate: string; make: string | null; model: string | null } | null;
}

export function useOpsRentalDetail(reference: string | null) {
  return useQuery({
    queryKey: ['rental', reference],
    queryFn: ({ signal }) => apiFetch<RentalDetail>(`/rentals/${reference}`, { signal }),
    enabled: !!reference,
  });
}

export function useReadiness(reference: string) {
  const qc = useQueryClient();
  const invalidate = useRentalInvalidate();
  return useMutation({
    mutationFn: (passed: boolean) =>
      apiFetch<Rental>(`/ops/rentals/${reference}/readiness`, { method: 'POST', body: { passed } }),
    onSuccess: () =>
      invalidate(() => {
        void qc.invalidateQueries({ queryKey: ['rental', reference] });
        void qc.invalidateQueries({ queryKey: ['ops', 'fleet-units'] });
      }),
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
  const invalidate = useRentalInvalidate();
  return useMutation({
    mutationFn: (body: {
      category: 'breakdown' | 'accident' | 'damage' | 'other';
      note?: string;
      immobilised?: boolean;
      replacementUnitId?: string;
    }) => apiFetch<Rental>(`/ops/rentals/${reference}/incident`, { method: 'POST', body }),
    onSuccess: () =>
      invalidate(() => {
        void qc.invalidateQueries({ queryKey: ['rental', reference] });
        void qc.invalidateQueries({ queryKey: ['ops', 'fleet-units'] });
        void qc.invalidateQueries({ queryKey: ['ops', 'fleet-blocks'] });
      }),
  });
}

export function useExtendRental(reference: string) {
  const qc = useQueryClient();
  const invalidate = useRentalInvalidate();
  return useMutation({
    mutationFn: (body: { newReturnAt: string; paymentToken?: string }) =>
      apiFetch<Rental & { deltaMinor: number }>(`/rentals/${reference}/extend`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => invalidate(() => void qc.invalidateQueries({ queryKey: ['rental'] })),
  });
}
