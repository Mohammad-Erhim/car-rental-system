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
  imageRef: string | null;
  imageUrl: string | null;
  version: number;
}

export interface UnitInput {
  categoryCode?: string;
  locationCode?: string;
  vin?: string;
  plate?: string;
  year?: string;
  make?: string;
  model?: string;
  colour?: string;
  imageRef?: string | null;
}

export interface OpsUnitList {
  page: number;
  pageSize: number;
  /** units on this page (every match when pagination wasn't requested) */
  count: number;
  /** units matching the current filters */
  total: number;
  pageCount: number;
  /** units per state under the location/category/search filters, ignoring the state filter */
  stateCounts: Record<string, number>;
  results: OpsUnit[];
}

export interface OpsUnitFilter {
  locationCode?: string;
  categoryCode?: string;
  state?: string;
  /** free text over plate, VIN, make and model */
  q?: string;
  /** pagination is opt-in: omit both to get every match (what the vehicle pickers need) */
  page?: number;
  pageSize?: number;
}

export function useOpsUnits(
  filter: OpsUnitFilter,
  opts: { enabled?: boolean; keepPrevious?: boolean } = {},
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v) qs.set(k, String(v));
  return useQuery({
    queryKey: ['ops', 'fleet-units', filter],
    // `keepPrevious` smooths a filter change on the fleet inventory list. It defaults OFF: every
    // other caller uses this as a picker's options for one specific target (assign/reassign/
    // incident-replacement) — showing the *previous* target's (wrong-category) units while the
    // new ones are still loading is actively misleading, not just a flicker.
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
    enabled: opts.enabled ?? true,
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

export function useCreateUnit() {
  const invalidate = useFleetInvalidate();
  return useMutation({
    mutationFn: (input: UnitInput) =>
      apiFetch<OpsUnit>('/ops/fleet/units', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateUnit() {
  const invalidate = useFleetInvalidate();
  return useMutation({
    mutationFn: ({ id, ifMatch, ...input }: UnitInput & { id: string; ifMatch?: number }) =>
      apiFetch<OpsUnit>(`/ops/fleet/units/${id}`, { method: 'POST', body: input, ifMatch }),
    onSuccess: invalidate,
  });
}

export function useSetUnitRetired() {
  const invalidate = useFleetInvalidate();
  return useMutation({
    mutationFn: ({ id, retired }: { id: string; retired: boolean }) =>
      apiFetch<OpsUnit>(`/ops/fleet/units/${id}/${retired ? 'retire' : 'restore'}`, {
        method: 'POST',
      }),
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

export interface RatePlanFee {
  code: string;
  label: string;
  amountMinor: number;
  taxable?: boolean;
}
export interface RatePlanTier {
  minHours: number;
  dayMinor: number;
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
  fees: RatePlanFee[];
  tiers: RatePlanTier[];
  status: 'draft' | 'in_review' | 'published' | 'retired';
  publishedVersion: number;
  version: number;
}

export interface RatePlanInput {
  id?: string;
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
  fees?: RatePlanFee[];
  tiers?: RatePlanTier[];
}

export function useRatePlans() {
  return useQuery({
    queryKey: ['ops', 'rate-plans'],
    queryFn: ({ signal }) => apiFetch<RatePlan[]>('/ops/pricing/rate-plans', { signal }),
  });
}

export function useSaveRatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ifMatch, ...body }: RatePlanInput & { ifMatch?: number }) =>
      apiFetch<RatePlan[]>('/ops/pricing/rate-plans', { method: 'POST', body, ifMatch }),
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

export function useDeleteRatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/ops/pricing/rate-plans/${id}`, { method: 'DELETE' }),
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
