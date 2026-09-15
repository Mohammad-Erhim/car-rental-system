import type { AddDriverRequest, Driver, PrivacyRequest, Profile } from '@carrental/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../api-fetch';

/**
 * The signed-in actor's own profile / saved drivers / GDPR data-request hooks — identical
 * between the ops dashboard (staff viewing their own account) and the customer site (SCREEN-
 * CUS-011/012/013/024), since both hit the same `/auth/*` endpoints for the calling actor. Used
 * to be maintained twice (`apps/web/src/lib/api-hooks.ts` and `apps/site/src/lib/customer-hooks.ts`
 * both carried byte-identical copies) — a CLAUDE.md "never solve the same problem twice" fix.
 */

// ---- profile ----

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
