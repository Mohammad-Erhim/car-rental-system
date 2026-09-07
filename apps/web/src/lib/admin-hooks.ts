import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch, getAccessToken } from './api.js';

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
  return useMutation({
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

export function useAuditLog(filter: { action?: string; targetType?: string }) {
  const qs = new URLSearchParams();
  if (filter.action) qs.set('action', filter.action);
  if (filter.targetType) qs.set('targetType', filter.targetType);
  return useQuery({
    queryKey: ['ops', 'audit', filter],
    queryFn: ({ signal }) =>
      apiFetch<AuditRow[]>(`/ops/audit${qs.toString() ? `?${qs}` : ''}`, { signal }),
  });
}
