import type {
  AddDriverRequest,
  ChallengeCreatedResponse,
  Driver,
  LookupType,
  LookupValuesResponse,
  PrivacyRequest,
  Profile,
  TranslationCompleteness,
  TranslationEntry,
} from '@carrental/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from './api.js';

// ---- customer profile ----

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

// ---- account data requests & closure (SCREEN-CUS-024) ----

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

// ---- translation catalogue (SCREEN-OPS-034) ----

export function useTranslationCompleteness() {
  return useQuery({
    queryKey: ['translations', 'completeness'],
    queryFn: ({ signal }) =>
      apiFetch<TranslationCompleteness>('/config/translations/completeness', { signal }),
  });
}

export function useTranslationList(namespace: string, locale: string) {
  return useQuery({
    queryKey: ['translations', namespace, locale],
    queryFn: ({ signal }) =>
      apiFetch<TranslationEntry[]>(
        `/config/translations?namespace=${encodeURIComponent(namespace)}&locale=${encodeURIComponent(locale)}`,
        { signal },
      ),
    enabled: !!namespace && !!locale,
  });
}

export function useUpsertTranslation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      namespace: string;
      key: string;
      localeCode: string;
      value: string;
      status?: 'draft' | 'in_review' | 'published';
    }) => apiFetch('/config/translations', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['translations'] }),
  });
}

export function usePublishTranslations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { namespace: string; locale: string }) =>
      apiFetch(
        `/config/translations/${encodeURIComponent(input.namespace)}/${encodeURIComponent(input.locale)}/publish`,
        { method: 'POST' },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['translations'] }),
  });
}

// ---- locale administration (SCREEN-OPS — Languages, DEC-024) ----

export interface AdminLocale {
  id: string;
  code: string;
  nativeName: string;
  englishName: string;
  direction: 'ltr' | 'rtl';
  fallbackChain: string[];
  isDefault: boolean;
  isActive: boolean;
  testOnly: boolean;
  sortOrder: number;
}

export function useAdminLocales() {
  return useQuery({
    queryKey: ['locales', 'admin'],
    queryFn: ({ signal }) => apiFetch<AdminLocale[]>('/config/locales', { signal }),
  });
}

export function useUpsertLocale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      code: string;
      nativeName: string;
      englishName: string;
      direction: 'ltr' | 'rtl';
      fallbackChain?: string[];
      sortOrder?: number;
    }) => apiFetch<AdminLocale>('/config/locales', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locales'] });
      qc.invalidateQueries({ queryKey: ['meta', 'locales'] });
    },
  });
}

export function useLocaleAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      code,
      action,
    }: {
      code: string;
      action: 'activate' | 'deactivate' | 'default';
    }) => apiFetch(`/config/locales/${encodeURIComponent(code)}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locales'] });
      qc.invalidateQueries({ queryKey: ['meta', 'locales'] });
      qc.invalidateQueries({ queryKey: ['translations'] });
    },
  });
}

// ---- reference data ----

export function useLookupTypes(params?: { classification?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.classification) qs.set('classification', params.classification);
  if (params?.search) qs.set('search', params.search);
  return useQuery({
    queryKey: ['reference-data', 'types', params],
    queryFn: ({ signal }) =>
      apiFetch<LookupType[]>(`/reference-data/types${qs.toString() ? `?${qs}` : ''}`, { signal }),
  });
}

export function useLookupValues(
  typeCode: string | null,
  opts?: { locale?: string; includeInactive?: boolean },
) {
  const qs = new URLSearchParams();
  if (opts?.locale) qs.set('locale', opts.locale);
  if (opts?.includeInactive) qs.set('includeInactive', 'true');
  return useQuery({
    queryKey: ['reference-data', 'values', typeCode, opts],
    queryFn: ({ signal }) =>
      apiFetch<LookupValuesResponse>(
        `/reference-data/types/${typeCode}/values${qs.toString() ? `?${qs}` : ''}`,
        { signal },
      ),
    enabled: !!typeCode,
  });
}

export interface LookupUsage {
  typeCode: string;
  valueCode: string;
  consumers: Array<{ surface: string; count: number }>;
  totalReferences: number;
  tracked?: boolean;
}

/** FR-ADM-008 "where used" — fetched on demand (e.g. before deactivating a value). */
export function useLookupUsage(typeCode: string, valueCode: string | null) {
  return useQuery({
    queryKey: ['reference-data', 'usage', typeCode, valueCode],
    queryFn: ({ signal }) =>
      apiFetch<LookupUsage>(`/reference-data/types/${typeCode}/values/${valueCode}/usage`, {
        signal,
      }),
    enabled: !!valueCode,
  });
}

export function useAuthMutation<TBody, TResult>(path: string, method: 'POST' = 'POST') {
  return useMutation({
    mutationFn: (body: TBody) =>
      apiFetch<TResult>(path, { method, body, anonymous: true }) as Promise<TResult>,
  });
}

export type { ChallengeCreatedResponse };
