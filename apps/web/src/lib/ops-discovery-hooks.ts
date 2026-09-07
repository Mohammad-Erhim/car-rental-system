import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

export function useOpsUnits(filter: { locationCode?: string; categoryCode?: string }) {
  const qs = new URLSearchParams();
  if (filter.locationCode) qs.set('locationCode', filter.locationCode);
  if (filter.categoryCode) qs.set('categoryCode', filter.categoryCode);
  return useQuery({
    queryKey: ['ops', 'fleet-units', filter],
    queryFn: ({ signal }) =>
      apiFetch<OpsUnit[]>(`/ops/fleet/units${qs.toString() ? `?${qs}` : ''}`, { signal }),
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
