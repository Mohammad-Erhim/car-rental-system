import { useI18n } from '@carrental/i18n/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ApiError, apiFetch } from './api.js';

/** Approval workflows — the task inbox, requests, and the administration of pipelines. */

export interface WorkflowSummary {
  instanceId: string;
  actionKey: string;
  status: WorkflowStatus;
  definitionName: string;
  stepId: string | null;
  stepName: string | null;
  waitingFor: string[];
  waitingForMore: number;
  dueAt: string | null;
  revision: number;
}

export type WorkflowStatus =
  | 'running'
  | 'applying'
  | 'apply_failed'
  | 'completed'
  | 'rejected'
  | 'withdrawn'
  | 'cancelled'
  | 'changes_requested'
  | 'stale';

export type WorkflowDecision = 'approve' | 'reject' | 'request_changes' | 'complete';

export interface InboxItem {
  taskId: string;
  instanceId: string;
  stepId: string;
  title: string;
  stepType: 'approval' | 'task';
  mode: string;
  dueAt: string | null;
  overdue: boolean;
  requireComment: boolean;
  actionKey: string;
  actionLabel: string;
  subjectType: string;
  subjectId: string;
  subjectLabel: string | null;
  initiatorLabel: string | null;
  requestedAt: string;
  canDecide: boolean;
  decisions: WorkflowDecision[];
}

export interface RequestRow extends WorkflowSummary {
  subjectType: string;
  subjectId: string;
  subjectLabel: string | null;
  initiatorLabel: string | null;
  createdAt: string;
  closedAt: string | null;
  lastError: string | null;
  actionLabel: string;
}

export interface RequestDetail extends RequestRow {
  actionDescription: string | null;
  initiator: { accountId: string; label: string | null };
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
  closedReason: string | null;
  applyAttempts: number;
  canWithdraw: boolean;
  canMonitor: boolean;
  tasks: Array<{
    id: string;
    stepId: string;
    title: string;
    stepType: string;
    status: 'open' | 'done' | 'cancelled';
    outcome: string | null;
    mode: string;
    required: number;
    dueAt: string | null;
    requireComment: boolean;
    allowChanges: boolean;
    decidedAt: string | null;
    assignees: Array<{
      staffProfileId: string;
      name: string;
      status: 'pending' | 'decided' | 'removed';
      decision: string | null;
      comment: string | null;
      decidedAt: string | null;
      source: string;
      isMe: boolean;
    }>;
  }>;
  history: Array<{
    id: string;
    type: string;
    actor: string | null;
    data: Record<string, unknown>;
    at: string;
  }>;
}

export interface GovernedAction {
  key: string;
  subjectType: string;
  label: string;
  description: string;
  variables: string[];
  securityCritical: boolean;
}

export interface DefinitionRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  archived: boolean;
  publishedRevision: number | null;
  hasDraft: boolean;
  stepCount: number;
  boundActions: number;
}

export interface DefinitionDetail
  extends Omit<DefinitionRow, 'publishedRevision' | 'hasDraft' | 'stepCount' | 'boundActions'> {
  versions: Array<{
    id: string;
    revision: number;
    status: 'draft' | 'published' | 'superseded';
    spec: Record<string, unknown>;
    note: string | null;
    publishedAt: string | null;
    createdAt: string;
  }>;
}

export interface BindingRow {
  id: string;
  actionKey: string;
  definitionId: string;
  definitionName: string;
  condition: Record<string, unknown> | null;
  priority: number;
  active: boolean;
  label: string | null;
}

/** What a governed action returns while its change waits for approval instead of being applied. */
export function isPendingApproval(
  v: unknown,
): v is { pendingApproval: true; workflow: WorkflowSummary } {
  return (
    !!v && typeof v === 'object' && (v as { pendingApproval?: unknown }).pendingApproval === true
  );
}

const KEY = ['ops', 'workflows'] as const;

/** Every workflow-related cache, refreshed after anything that could move a request along. */
function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ['ops', 'config-versions'] });
    void qc.invalidateQueries({ queryKey: ['ops', 'templates'] });
    void qc.invalidateQueries({ queryKey: ['ops', 'customers'] });
  };
}

const failToast = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Action failed');

/** How many tasks are waiting for me — polled lightly and refreshed on focus (the bell). */
export function useTaskCount(enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'count'],
    queryFn: ({ signal }) =>
      apiFetch<{ pending: number; overdue: number }>('/workflows/inbox/count', { signal }),
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

export function useInbox() {
  return useQuery({
    queryKey: [...KEY, 'inbox'],
    queryFn: ({ signal }) => apiFetch<InboxItem[]>('/workflows/inbox?limit=100', { signal }),
    refetchOnWindowFocus: true,
  });
}

export function useRequests(scope: 'mine' | 'all', status?: string) {
  const qs = new URLSearchParams({ scope, limit: '100' });
  if (status) qs.set('status', status);
  return useQuery({
    queryKey: [...KEY, 'requests', scope, status ?? null],
    queryFn: ({ signal }) => apiFetch<RequestRow[]>(`/workflows/instances?${qs}`, { signal }),
    refetchOnWindowFocus: true,
  });
}

export function useRequest(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'request', id],
    queryFn: ({ signal }) => apiFetch<RequestDetail>(`/workflows/instances/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useDecide() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({
      taskId,
      decision,
      comment,
    }: {
      taskId: string;
      decision: WorkflowDecision;
      comment?: string;
    }) =>
      apiFetch<WorkflowSummary>(`/workflows/tasks/${taskId}/decide`, {
        method: 'POST',
        body: { decision, ...(comment ? { comment } : {}) },
      }),
    onSuccess: refresh,
    onError: failToast,
  });
}

export function useWithdraw() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiFetch<WorkflowSummary>(`/workflows/instances/${id}/withdraw`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: refresh,
    onError: failToast,
  });
}

export function useMonitorAction() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (
      input:
        | { kind: 'cancel'; id: string; reason: string }
        | { kind: 'force'; id: string; decision: 'approve' | 'reject'; reason: string }
        | {
            kind: 'reassign';
            taskId: string;
            toStaffProfileId: string;
            fromStaffProfileId?: string;
            reason?: string;
          },
    ) => {
      if (input.kind === 'cancel')
        return apiFetch<WorkflowSummary>(`/workflows/instances/${input.id}/cancel`, {
          method: 'POST',
          body: { reason: input.reason },
        });
      if (input.kind === 'force')
        return apiFetch<WorkflowSummary>(`/workflows/instances/${input.id}/force`, {
          method: 'POST',
          body: { decision: input.decision, reason: input.reason },
        });
      return apiFetch<WorkflowSummary>(`/workflows/tasks/${input.taskId}/reassign`, {
        method: 'POST',
        body: {
          toStaffProfileId: input.toStaffProfileId,
          fromStaffProfileId: input.fromStaffProfileId,
          reason: input.reason,
        },
      });
    },
    onSuccess: refresh,
    onError: failToast,
  });
}

// ───────────── administration ─────────────

export function useGovernedActions() {
  return useQuery({
    queryKey: [...KEY, 'actions'],
    queryFn: ({ signal }) => apiFetch<GovernedAction[]>('/admin/workflows/actions', { signal }),
    staleTime: 5 * 60_000,
  });
}

export function useDefinitions() {
  return useQuery({
    queryKey: [...KEY, 'definitions'],
    queryFn: ({ signal }) => apiFetch<DefinitionRow[]>('/admin/workflows/definitions', { signal }),
  });
}

export function useDefinition(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'definition', id],
    queryFn: ({ signal }) =>
      apiFetch<DefinitionDetail>(`/admin/workflows/definitions/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useBindings() {
  return useQuery({
    queryKey: [...KEY, 'bindings'],
    queryFn: ({ signal }) => apiFetch<BindingRow[]>('/admin/workflows/bindings', { signal }),
  });
}

export function useSaveBinding() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: {
      id?: string;
      actionKey: string;
      definitionId: string;
      condition?: Record<string, unknown> | null;
      priority?: number;
      label?: string;
      active?: boolean;
    }) => apiFetch<BindingRow>('/admin/workflows/bindings', { method: 'PUT', body }),
    onSuccess: refresh,
  });
}

export function useRemoveBinding() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/admin/workflows/bindings/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
}

export function useCloneDefinition() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, code, name }: { id: string; code: string; name: string }) =>
      apiFetch<DefinitionDetail>(`/admin/workflows/definitions/${id}/clone`, {
        method: 'POST',
        body: { code, name },
      }),
    onSuccess: refresh,
  });
}

export interface SimulationStep {
  stepId: string;
  name: string;
  type: string;
  mode?: string;
  required?: number;
  dueHours?: number;
  branch?: string;
  asks: Array<{ staffProfileId: string; name: string; source: string }>;
}

export function useSimulate() {
  return useMutation({
    mutationFn: (body: {
      definitionId?: string;
      spec?: unknown;
      actionKey?: string;
      context?: Record<string, unknown>;
    }) =>
      apiFetch<{ direct: boolean; path: SimulationStep[]; maxHours: number }>(
        '/admin/workflows/simulate',
        {
          method: 'POST',
          body,
        },
      ),
  });
}

// ───────────── builder ─────────────

export interface WorkflowOptions {
  roles: Array<{ code: string; name: string; isSystem: boolean }>;
  groups: Array<{ id: string; code: string; name: string }>;
  people: Array<{ staffProfileId: string; name: string; email: string }>;
}

export function useWorkflowOptions() {
  return useQuery({
    queryKey: [...KEY, 'options'],
    queryFn: ({ signal }) => apiFetch<WorkflowOptions>('/admin/workflows/options', { signal }),
    staleTime: 60_000,
  });
}

export interface WorkflowIssue {
  code: string;
  stepId?: string;
  message: string;
}

/** Server-side check of a draft (actors resolve to real people, rules read known variables). */
export function useValidateWorkflow() {
  return useMutation({
    mutationFn: (body: { spec: unknown; actionKeys?: string[] }) =>
      apiFetch<{ issues: WorkflowIssue[] }>('/admin/workflows/definitions/validate', {
        method: 'POST',
        body,
      }),
  });
}

export function useCreateDefinition() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: {
      code: string;
      name: string;
      description?: string;
      spec: unknown;
      note?: string;
    }) => apiFetch<DefinitionDetail>('/admin/workflows/definitions', { method: 'POST', body }),
    onSuccess: refresh,
  });
}

export function useSaveDraft() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      spec: unknown;
      name?: string;
      description?: string;
      note?: string;
    }) =>
      apiFetch<DefinitionDetail>(`/admin/workflows/definitions/${id}/draft`, {
        method: 'PUT',
        body,
      }),
    onSuccess: refresh,
  });
}

export function usePublishDefinition() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, versionId }: { id: string; versionId?: string }) =>
      apiFetch<DefinitionDetail>(`/admin/workflows/definitions/${id}/publish`, {
        method: 'POST',
        body: versionId ? { versionId } : {},
      }),
    onSuccess: refresh,
  });
}

export function useArchiveDefinition() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/admin/workflows/definitions/${id}/archive`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: refresh,
  });
}

/**
 * Call on the result of any governed action (refund, cancellation, publish, archive, merge…): when
 * a workflow holds the change for approval it tells the person so and returns `true` — the caller
 * then skips its own "done" message, because nothing has been done yet.
 */
export function usePendingApproval() {
  const { t } = useI18n();
  const qc = useQueryClient();
  return (res: unknown): boolean => {
    if (!isPendingApproval(res)) return false;
    toast.info(t('ops.wf.sentForApprovalGeneric'));
    void qc.invalidateQueries({ queryKey: KEY });
    return true;
  };
}
