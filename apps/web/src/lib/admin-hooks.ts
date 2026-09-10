import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch, getAccessToken } from './api.js';
import { useWorkflowError } from './use-workflow-error.js';

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

// ---- config versioning (SCREEN-OPS-033/034, FR-ADM-005..007) ----

export type ConfigState = 'draft' | 'in_review' | 'published' | 'superseded' | 'rejected';

export interface ConfigVersion {
  id: string;
  kind: string;
  key: string;
  revision: number;
  state: ConfigState;
  payload: Record<string, number>;
  note: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  effectiveFrom: string | null;
  createdAt: string;
}

export function useConfigVersions(kind: string, key?: string) {
  const qs = new URLSearchParams({ kind });
  if (key) qs.set('key', key);
  return useQuery({
    queryKey: ['ops', 'config-versions', kind, key ?? null],
    queryFn: ({ signal }) => apiFetch<ConfigVersion[]>(`/ops/config/versions?${qs}`, { signal }),
  });
}

export function useConfigPreview() {
  return useMutation({
    mutationFn: (body: { kind: string; payload: Record<string, number> }) =>
      apiFetch<{ examples: string[] }>('/ops/config/versions/preview', { method: 'POST', body }),
  });
}

export function useDraftConfigVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      kind: string;
      key: string;
      payload: Record<string, number>;
      note?: string;
    }) => apiFetch<ConfigVersion>('/ops/config/versions', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'config-versions'] }),
  });
}

export function useConfigVersionTransition() {
  const qc = useQueryClient();
  const onError = useWorkflowError();
  return useMutation({
    onError,
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: string;
      action: 'submit' | 'approve' | 'reject';
      note?: string;
    }) =>
      apiFetch<ConfigVersion>(`/ops/config/versions/${id}/${action}`, {
        method: 'POST',
        body: action === 'reject' ? { note: note ?? '' } : {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'config-versions'] }),
  });
}

// ---- reports (SCREEN-OPS-035, FR-RPT-001..004) ----

export interface ReportDefinition {
  id: string;
  code: string;
  title: string;
  description: string | null;
  queryKind: string;
  columns: string[];
  minPermission: string;
}

export interface ReportRunResult {
  runId: string;
  code: string;
  title: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  scopeNote: string;
}

export interface ReportRunSummary {
  id: string;
  definitionCode: string;
  rowCount: number;
  scopeNote: string | null;
  createdAt: string;
}

export interface ReportSchedule {
  id: string;
  definitionCode: string;
  cron: string;
  recipients: string[];
  isActive: string;
  lastRunAt: string | null;
  lastSkipReason: string | null;
}

export function useReportDefinitions() {
  return useQuery({
    queryKey: ['ops', 'report-defs'],
    queryFn: ({ signal }) => apiFetch<ReportDefinition[]>('/ops/reports', { signal }),
  });
}

export function useReportRuns() {
  return useQuery({
    queryKey: ['ops', 'report-runs'],
    queryFn: ({ signal }) => apiFetch<ReportRunSummary[]>('/ops/reports/runs', { signal }),
  });
}

export function useRunReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, params }: { code: string; params?: Record<string, unknown> }) =>
      apiFetch<ReportRunResult>(`/ops/reports/${code}/run`, {
        method: 'POST',
        body: { params: params ?? {} },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'report-runs'] }),
  });
}

export function useReportSchedules() {
  return useQuery({
    queryKey: ['ops', 'report-schedules'],
    queryFn: ({ signal }) => apiFetch<ReportSchedule[]>('/ops/reports/schedules', { signal }),
  });
}

export function useScheduleReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      definitionCode: string;
      cron: string;
      recipients: string[];
      params?: Record<string, unknown>;
    }) => apiFetch<ReportSchedule>('/ops/reports/schedules', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'report-schedules'] }),
  });
}

export function useSendReportSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<
        { sent: true; runId: string; recipients: string[] } | { sent: false; reason: string }
      >(`/ops/reports/schedules/${id}/send`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ops', 'report-schedules'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'report-runs'] });
    },
  });
}

/** Fetch a completed run as CSV text (the endpoint returns text/csv, not JSON). */
export async function fetchReportCsv(runId: string): Promise<string> {
  const token = getAccessToken();
  const res = await fetch(`${BASE}/ops/reports/runs/${runId}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  return res.text();
}

// ---- audit viewer (SCREEN-OPS-038, FR-ADM-009) ----

export interface AuditRow {
  id: string;
  occurredAt: string;
  actor: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  outcome: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export function useAuditLog(filter: {
  action?: string;
  targetType?: string;
  from?: string;
  to?: string;
}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v) qs.set(k, v);
  return useQuery({
    queryKey: ['ops', 'audit', filter],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch<AuditRow[]>(`/ops/audit${qs.toString() ? `?${qs}` : ''}`, { signal }),
  });
}

// ---- data quality (SCREEN-OPS-039, FR-ADM-013) ----

export interface DataQualityCheck {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  count: number;
  ok: boolean;
  sample: string[];
}
export interface DataQualityReport {
  checkedAt: string;
  ok: boolean;
  checks: DataQualityCheck[];
}

export function useDataQuality() {
  return useQuery({
    queryKey: ['ops', 'data-quality'],
    queryFn: ({ signal }) => apiFetch<DataQualityReport>('/ops/data-quality', { signal }),
  });
}

// ---- operational dashboard (SCREEN-OPS-002, FR-RPT-001) ----

export interface OpsDashboard {
  checkedAt: string;
  scopeNote: string;
  pickupsToday: { total: number; done: number };
  returnsToday: { total: number; done: number };
  overdue: number;
  assignQueue: number;
  cancellationsToday: number;
  revenueToday: { minor: number; currency: string };
  financeExceptions: { recoveryCases: number; reconciliation: number; total: number };
  fleet: {
    available: number;
    on_rent: number;
    prep: number;
    maintenance: number;
    other: number;
  };
  fleetTotal: number;
  /** share of the fleet on rent, 0..100; null when no units exist */
  utilisation: number | null;
}

export function useOpsDashboard() {
  return useQuery({
    queryKey: ['ops', 'dashboard'],
    queryFn: ({ signal }) => apiFetch<OpsDashboard>('/ops/dashboard', { signal }),
    refetchInterval: 60_000,
  });
}

// ---- notification templates (SCREEN-OPS-033 / FR-ADM-011) ----

export interface TemplateVar {
  name: string;
  required?: boolean;
  legal?: boolean;
}

export interface TemplateGroup {
  key: string;
  channel: string;
  locales: Array<{
    localeCode: string;
    version: string;
    status: string;
    updatedAt: string;
    hasDraft: boolean;
  }>;
  missingLocales: string[];
}

export interface TemplateDetail {
  id: string;
  key: string;
  channel: string;
  localeCode: string;
  version: string;
  status: string;
  subject: string | null;
  bodyTemplate: string;
  variables: TemplateVar[];
  publishedVersion: string | null;
  hasOpenDraft: boolean;
}

export function useTemplateGroups() {
  return useQuery({
    queryKey: ['ops', 'templates'],
    queryFn: ({ signal }) => apiFetch<TemplateGroup[]>('/ops/templates', { signal }),
  });
}

export function useTemplateDetail(
  key: string | null,
  channel: string | null,
  locale: string | null,
) {
  return useQuery({
    queryKey: ['ops', 'template', key, channel, locale],
    enabled: !!key && !!channel && !!locale,
    queryFn: ({ signal }) =>
      apiFetch<TemplateDetail>(`/ops/templates/${key}/${channel}/${locale}`, { signal }),
  });
}

export function useTemplatePreview() {
  return useMutation({
    mutationFn: (body: {
      subject?: string | null;
      bodyTemplate: string;
      variables: TemplateVar[];
      sample?: Record<string, unknown>;
    }) =>
      apiFetch<{ subject: string; body: string; missingVars: string[]; contentIssues: string[] }>(
        '/ops/templates/preview',
        { method: 'POST', body },
      ),
  });
}

export function useSaveTemplateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      key: string;
      channel: string;
      localeCode: string;
      subject?: string | null;
      bodyTemplate: string;
      variables: TemplateVar[];
      note?: string;
    }) => apiFetch<TemplateDetail>('/ops/templates/draft', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ops', 'templates'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'template'] });
    },
  });
}

export function useTemplateTransition() {
  const qc = useQueryClient();
  const onError = useWorkflowError();
  return useMutation({
    onError,
    mutationFn: ({ id, action }: { id: string; action: 'submit' | 'publish' }) =>
      apiFetch<TemplateDetail>(`/ops/templates/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ops', 'templates'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'template'] });
    },
  });
}

// ---- customer records (SCREEN-OPS-021/022 / FR-ADM-001, read side) ----

export interface CustomerSearchHit {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  localeCode: string;
  restricted: boolean;
}

export interface CustomerRecord {
  id: string;
  accountId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  localeCode: string;
  timezone: string | null;
  address: Record<string, string>;
  communicationPrefs: Record<string, boolean>;
  consents: Array<{ type: string; version: string; acceptedAt: string }>;
  status: string;
  mergedIntoId: string | null;
  createdAt: string;
  mergeHistory: Array<{
    id: string;
    mergedId: string;
    reason: string | null;
    reversedAt: string | null;
    movedDrivers: number;
    movedRestrictions: number;
    createdAt: string;
  }>;
  drivers: Array<{
    id: string;
    fullName: string;
    licenceNumber: string | null;
    licenceCountry: string | null;
    licenceExpiresOn: string | null;
  }>;
  reservations: Array<{
    reference: string;
    state: string;
    pickupAt: string;
    returnAt: string;
    currency: string;
    totalMinor: number;
    paidMinor: number;
  }>;
  rentals: Array<{ reference: string; reservationReference: string; state: string }>;
  restrictions: CustomerRestriction[];
  openCases: Array<{ id: string; kind: string; state: string; subjectRef: string | null }>;
  balance: { currency: string; minor: number };
}

export interface CustomerRestriction {
  id: string;
  category: 'review' | 'block';
  scope: string;
  reasonCode: string | null;
  evidenceRef: string | null;
  status: 'pending_review' | 'active' | 'rejected' | 'lifted';
  reviewNotes: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isActive: boolean;
}

export function useCreateRestriction(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      category: 'review' | 'block';
      scope?: string;
      reasonCode?: string;
      evidenceRef?: string;
      effectiveFrom?: string;
      effectiveTo?: string;
    }) =>
      apiFetch<CustomerRestriction>(`/ops/customers/${customerId}/restrictions`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ops', 'customer', customerId] }),
  });
}

export function useRestrictionDecision(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      rid,
      action,
      notes,
    }: {
      rid: string;
      action: 'approve' | 'reject' | 'lift';
      notes?: string;
    }) =>
      apiFetch<CustomerRestriction>(`/ops/customers/${customerId}/restrictions/${rid}/${action}`, {
        method: 'POST',
        body: { notes },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ops', 'customer', customerId] }),
  });
}

export function useMergeCustomer(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { intoId: string; reason?: string }) =>
      apiFetch(`/ops/customers/${customerId}/merge`, { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ops'] }),
  });
}

export function useUnmergeCustomer(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/ops/customers/${customerId}/unmerge`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ops'] }),
  });
}

export function useCustomerSearch(q: string) {
  return useQuery({
    queryKey: ['ops', 'customers', q],
    enabled: q.trim().length >= 2,
    queryFn: ({ signal }) =>
      apiFetch<{ query: string; count: number; results: CustomerSearchHit[] }>(
        `/ops/customers?q=${encodeURIComponent(q.trim())}`,
        { signal },
      ),
  });
}

export function useCustomerRecord(id: string | null) {
  return useQuery({
    queryKey: ['ops', 'customer', id],
    enabled: !!id,
    queryFn: ({ signal }) => apiFetch<CustomerRecord>(`/ops/customers/${id}`, { signal }),
  });
}

// ---- extras & protection products (SCREEN-OPS-027 / FR-ADM-006) ----

export type ProductPricingUnit = 'per_rental' | 'per_day';

export interface CatalogueProduct {
  id: string;
  code: string;
  name: string;
  kind: 'extra' | 'protection';
  unitPriceMinor: number;
  currency: string;
  pricingUnit: ProductPricingUnit;
  taxable: boolean;
  maxQuantity: number;
  categoryScope: string[];
  locationScope: string[];
  sortOrder: number;
  active: boolean;
}

export interface ProductInput {
  code: string;
  name: string;
  kind: 'extra' | 'protection';
  unitPriceMinor: number;
  currency?: string;
  pricingUnit?: ProductPricingUnit;
  taxable?: boolean;
  maxQuantity?: number;
  categoryScope?: string[];
  locationScope?: string[];
  sortOrder?: number;
}

const PRODUCT_KEY = ['ops', 'catalogue-products'];

export function useCatalogueProducts() {
  return useQuery({
    queryKey: PRODUCT_KEY,
    queryFn: ({ signal }) => apiFetch<CatalogueProduct[]>('/ops/catalogue/products', { signal }),
  });
}

export function useUpsertProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProductInput) =>
      apiFetch<CatalogueProduct>('/ops/catalogue/products', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: PRODUCT_KEY }),
  });
}

export function useSetProductActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, active }: { code: string; active: boolean }) =>
      apiFetch<CatalogueProduct>(
        `/ops/catalogue/products/${code}/${active ? 'restore' : 'deactivate'}`,
        {
          method: 'POST',
        },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: PRODUCT_KEY }),
  });
}

// ---- unified reservation + rental search (SCREEN-OPS-004 / FR-ADM-003) ----

export interface SearchHit {
  kind: 'reservation' | 'rental';
  reference: string;
  reservationReference: string | null;
  status: string;
  overdue: boolean;
  driverName: string | null;
  locationCode: string;
  returnLocationCode: string;
  pickupAt: string;
  returnAt: string;
  categoryCode: string | null;
  plate: string | null;
  currency: string | null;
  totalMinor: number | null;
  paidMinor: number | null;
  href: string;
}

export interface OpsSearchParams {
  q?: string;
  kind?: 'reservation' | 'rental';
  status?: string;
  locationCode?: string;
  from?: string;
  to?: string;
}

export interface OpsSearchResponse {
  query: string;
  /** rows returned (<= the display cap) */
  count: number;
  /** true number of matches before the cap */
  total: number;
  /** true when `total > count` — prompt the operator to narrow */
  truncated: boolean;
  results: SearchHit[];
}

/** A query is worth running once there are 2+ characters OR at least one structured filter. */
export function opsSearchReady(p: OpsSearchParams): boolean {
  return (
    (p.q?.trim().length ?? 0) >= 2 ||
    !!p.kind ||
    !!p.status ||
    !!p.locationCode ||
    !!p.from ||
    !!p.to
  );
}

export function useOpsSearch(params: OpsSearchParams) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v.trim());
  return useQuery({
    queryKey: ['ops', 'search', params],
    enabled: opsSearchReady(params),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiFetch<OpsSearchResponse>(`/ops/search${qs.toString() ? `?${qs}` : ''}`, { signal }),
  });
}

// ---- location & operating-hours admin (SCREEN-OPS-028 / FR-ADM-007) ----

export interface HoursSlot {
  day: number;
  open?: string;
  close?: string;
  closed?: boolean;
}

export interface OpsLocation {
  id: string;
  code: string;
  name: string;
  timezone: string;
  address: Record<string, string>;
  contact: Record<string, string>;
  latitude: string | null;
  longitude: string | null;
  regularHours: HoursSlot[];
  afterHoursReturn: boolean;
  pickupInstructions: string | null;
  returnInstructions: string | null;
  supportedCategoryCodes: string[];
  turnaroundMinutes: number;
  status: 'draft' | 'active' | 'archived';
}

export interface OpsLocationDetail extends OpsLocation {
  hoursExceptions: Array<{
    id: string;
    date: string;
    closed: boolean;
    open: string | null;
    close: string | null;
    reason: string | null;
  }>;
}

export type LocationInput = Partial<Omit<OpsLocation, 'id'>> &
  Pick<OpsLocation, 'code' | 'name' | 'timezone'>;

const LOC_KEY = ['ops', 'locations'];

export function useOpsLocations() {
  return useQuery({
    queryKey: LOC_KEY,
    queryFn: ({ signal }) => apiFetch<OpsLocation[]>('/ops/locations', { signal }),
  });
}

export function useOpsLocation(code: string | null) {
  return useQuery({
    queryKey: [...LOC_KEY, code],
    enabled: !!code,
    queryFn: ({ signal }) => apiFetch<OpsLocationDetail>(`/ops/locations/${code}`, { signal }),
  });
}

export function useOpsLocationImpact(code: string | null) {
  return useQuery({
    queryKey: [...LOC_KEY, code, 'impact'],
    enabled: !!code,
    queryFn: ({ signal }) =>
      apiFetch<{ code: string; futureReservations: number }>(`/ops/locations/${code}/impact`, {
        signal,
      }),
  });
}

function useLocInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: LOC_KEY });
}

export function useUpsertLocation() {
  const invalidate = useLocInvalidate();
  return useMutation({
    mutationFn: (body: LocationInput) =>
      apiFetch<OpsLocation>('/ops/locations', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useLocationStatus() {
  const invalidate = useLocInvalidate();
  return useMutation({
    mutationFn: ({
      code,
      action,
      force,
    }: {
      code: string;
      action: 'archive' | 'restore';
      force?: boolean;
    }) =>
      apiFetch<OpsLocation>(`/ops/locations/${code}/${action}${force ? '?force=true' : ''}`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });
}

export function useAddHoursException() {
  const invalidate = useLocInvalidate();
  return useMutation({
    mutationFn: ({
      code,
      ...body
    }: {
      code: string;
      date: string;
      closed?: boolean;
      open?: string | null;
      close?: string | null;
      reason?: string;
    }) => apiFetch(`/ops/locations/${code}/hours-exceptions`, { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useRemoveHoursException() {
  const invalidate = useLocInvalidate();
  return useMutation({
    mutationFn: ({ code, id }: { code: string; id: string }) =>
      apiFetch(`/ops/locations/${code}/hours-exceptions/${id}/remove`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

// ---- notification event rules (SCREEN-OPS-033 / FR-ADM-011, event-rules half) ----

export interface NotificationRule {
  event: string;
  channel: string;
  enabled: boolean;
  audience: 'primary_renter' | 'account_holder' | 'all_drivers' | 'ops';
  delayMinutes: number;
  quietHours: { start: string; end: string } | null;
  maxAttempts: number;
  retryBackoffMinutes: number;
  escalateAfterAttempts: number | null;
  senderIdentity: string | null;
  isDefault: boolean;
}

export type NotificationRuleInput = Partial<Omit<NotificationRule, 'isDefault'>> &
  Pick<NotificationRule, 'event'>;

const RULE_KEY = ['ops', 'notification-rules'];

export function useNotificationRule(event: string | null, channel: string | null) {
  return useQuery({
    queryKey: [...RULE_KEY, event, channel],
    enabled: !!event && !!channel,
    queryFn: ({ signal }) =>
      apiFetch<NotificationRule>(`/ops/notification-rules/${event}/${channel}`, { signal }),
  });
}

export function useUpsertNotificationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationRuleInput) =>
      apiFetch<NotificationRule>('/ops/notification-rules', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: RULE_KEY }),
  });
}
