import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from './api.js';

export interface OpsUnit {
  id: string;
  categoryCode: string;
  categoryName: string;
  currentLocationCode: string;
  homeLocationCode: string;
  vin: string;
  plate: string;
  make: string | null;
  model: string | null;
  year: string | null;
  colour: string | null;
  state: string;
}

export interface OpsUnitList {
  count: number;
  total: number;
  results: OpsUnit[];
}

export function useOpsUnits(filter: {
  locationCode?: string;
  categoryCode?: string;
  state?: string;
}) {
  const qs = new URLSearchParams();
  if (filter.locationCode) qs.set('locationCode', filter.locationCode);
  if (filter.categoryCode) qs.set('categoryCode', filter.categoryCode);
  if (filter.state) qs.set('state', filter.state);
  return useQuery({
    queryKey: ['ops', 'fleet-units', filter],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch<OpsUnitList>(`/ops/fleet/units${qs.toString() ? `?${qs}` : ''}`, { signal }),
  });
}

// --- fleet operations: maintenance blocks + transfers (SCREEN-OPS-017/018) ---

export interface FleetBlock {
  id: string;
  unitId: string;
  plate: string;
  kind: string;
  reasonCode: string | null;
  startAt: string;
  endAt: string | null;
  note: string | null;
  status: string;
  createdAt: string;
}

const FLEET_KEYS = { units: ['ops', 'fleet-units'], blocks: ['ops', 'fleet-blocks'] };

export function useFleetBlocks(status: 'active' | 'released' = 'active') {
  return useQuery({
    queryKey: [...FLEET_KEYS.blocks, status],
    queryFn: ({ signal }) =>
      apiFetch<FleetBlock[]>(`/ops/fleet/blocks?status=${status}`, { signal }),
  });
}

function useFleetInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: FLEET_KEYS.units });
    void qc.invalidateQueries({ queryKey: FLEET_KEYS.blocks });
  };
}

export function useAddFleetBlock() {
  const invalidate = useFleetInvalidate();
  return useMutation({
    mutationFn: (body: {
      unitId: string;
      kind?: string;
      reasonCode?: string;
      startAt: string;
      endAt?: string;
      note?: string;
    }) => apiFetch<{ id: string }>('/ops/fleet/blocks', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useReleaseFleetBlock() {
  const invalidate = useFleetInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/ops/fleet/blocks/${id}/release`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useTransferUnit() {
  const invalidate = useFleetInvalidate();
  return useMutation({
    mutationFn: (input: { unitId: string; toLocationCode: string; note?: string }) =>
      apiFetch<{ id: string; currentLocationCode: string; state: string }>(
        `/ops/fleet/units/${input.unitId}/transfer`,
        { method: 'POST', body: { toLocationCode: input.toLocationCode, note: input.note } },
      ),
    onSuccess: invalidate,
  });
}

export interface UnitImportResult {
  total: number;
  valid: number;
  committed: boolean;
  created: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

export function useImportUnits() {
  const invalidate = useFleetInvalidate();
  return useMutation({
    mutationFn: (input: { csv: string; commit: boolean }) =>
      apiFetch<UnitImportResult>('/ops/fleet/units/import', { method: 'POST', body: input }),
    onSuccess: (r) => {
      if (r.committed) invalidate();
    },
  });
}

export interface RatePlan {
  id: string;
  categoryCode: string;
  locationCode: string | null;
  currency: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  baseDayMinor: number;
  hourMinor: number;
  minDurationHours: number;
  maxDurationHours: number | null;
  taxBps: number;
  fees: Array<{ code: string; label: string; amountMinor: number; taxable?: boolean }>;
  status: 'draft' | 'in_review' | 'published' | 'retired';
  publishedVersion: number;
}

export function useRatePlans() {
  return useQuery({
    queryKey: ['ops', 'rate-plans'],
    queryFn: ({ signal }) => apiFetch<RatePlan[]>('/ops/pricing/rate-plans', { signal }),
  });
}

export function useCreateRatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      categoryCode: string;
      locationCode?: string | null;
      currency?: string;
      name: string;
      effectiveFrom: string;
      effectiveTo?: string | null;
      baseDayMinor: number;
      hourMinor?: number;
      minDurationHours?: number;
      maxDurationHours?: number | null;
      taxBps?: number;
      fees?: Array<{ code: string; label: string; amountMinor: number; taxable?: boolean }>;
      tiers?: Array<{ minHours: number; dayMinor: number }>;
    }) => apiFetch<RatePlan[]>('/ops/pricing/rate-plans', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'rate-plans'] }),
  });
}

export function usePublishRatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/ops/pricing/rate-plans/${id}/publish`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'rate-plans'] }),
  });
}

export function useOpsCategories() {
  return useQuery({
    queryKey: ['ops', 'catalogue-categories'],
    queryFn: ({ signal }) =>
      apiFetch<Array<{ code: string; displayName: string }>>('/ops/catalogue/categories', {
        signal,
      }),
  });
}
