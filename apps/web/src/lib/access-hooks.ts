import { apiFetch } from '@carrental/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Access administration — roles, the permission matrix, a person's roles and overrides, teams. */

export interface PermissionAction {
  code: string;
  group: string;
  riskLevel: 'normal' | 'elevated' | 'high' | string;
  description: string;
}

export interface RoleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** system roles are read-only — clone one to customise */
  locked: boolean;
  archived: boolean;
  /** granted action codes; `*` = everything */
  permissionActions: string[];
  /** e.g. `{ 'payment.refund': { amountMinorMax: 50000 } }` */
  conditions: Record<string, { amountMinorMax?: number }>;
  holderCount: number;
  version: number;
}

export interface RolesResponse {
  roles: RoleRow[];
  permissionActions: PermissionAction[];
}

export type AccessSource =
  | { kind: 'role'; code: string; name: string; validUntil: string | null }
  | {
      kind: 'override';
      effect: 'allow' | 'deny';
      validUntil: string | null;
      reason: string | null;
    };

export interface StaffAccess {
  staff: {
    accountId: string;
    displayName: string;
    email: string;
    status: string;
    accountStatus: string;
    locationScope: string[];
  };
  assignments: Array<{
    id: string;
    roleCode: string;
    roleName: string;
    validFrom: string;
    validUntil: string | null;
    reason: string | null;
    state: 'active' | 'scheduled' | 'expired' | 'archived';
  }>;
  overrides: Array<{
    id: string;
    action: string;
    effect: 'allow' | 'deny';
    validUntil: string | null;
    reason: string | null;
    expired: boolean;
  }>;
  groups: Array<{ code: string; name: string }>;
  effective: {
    roleCodes: string[];
    permissions: string[];
    denied: string[];
    conditions: Record<string, { amountMinorMax?: number }>;
    sources: Record<string, AccessSource[]>;
  };
}

export interface UsersMatrix {
  permissionActions: PermissionAction[];
  staff: Array<{
    accountId: string;
    displayName: string;
    email: string;
    status: string;
    roleCodes: string[];
    permissions: string[];
    denied: string[];
    conditions: Record<string, { amountMinorMax?: number }>;
    /** per action: the role names / "override:allow|deny" it comes from */
    via: Record<string, string[]>;
  }>;
}

export interface MatrixChange {
  roleCode: string;
  add?: string[];
  remove?: string[];
}
export interface MatrixResult {
  applied: boolean;
  changes: Array<{ roleCode: string; added: string[]; removed: string[]; affectedStaff: number }>;
}

export interface AccessEvent {
  seq: number;
  occurredAt: string;
  action: string;
  actorLabel: string | null;
  targetType: string;
  targetId: string | null;
  /** the person's name when the target is an account */
  targetLabel: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface StaffGroup {
  id: string;
  code: string;
  name: string;
  description: string | null;
  archived: boolean;
  members: Array<{ accountId: string; displayName: string }>;
}

const KEYS = {
  roles: ['admin', 'roles'] as const,
  users: ['admin', 'access', 'users-matrix'] as const,
  staff: (id: string) => ['admin', 'access', 'staff', id] as const,
  history: ['admin', 'access', 'history'] as const,
  groups: ['admin', 'groups'] as const,
  staffList: ['admin', 'staff'] as const,
};

export function useRoles() {
  return useQuery({
    queryKey: KEYS.roles,
    queryFn: ({ signal }) => apiFetch<RolesResponse>('/admin/roles', { signal }),
  });
}

export function useUsersMatrix() {
  return useQuery({
    queryKey: KEYS.users,
    queryFn: ({ signal }) => apiFetch<UsersMatrix>('/admin/access/users-matrix', { signal }),
  });
}

export function useStaffAccess(accountId: string | null) {
  return useQuery({
    queryKey: KEYS.staff(accountId ?? ''),
    enabled: !!accountId,
    queryFn: ({ signal }) => apiFetch<StaffAccess>(`/admin/staff/${accountId}/access`, { signal }),
  });
}

export function useAccessHistory(accountId?: string) {
  return useQuery({
    queryKey: [...KEYS.history, accountId ?? null],
    queryFn: ({ signal }) =>
      apiFetch<AccessEvent[]>(
        `/admin/access/history?limit=100${accountId ? `&accountId=${accountId}` : ''}`,
        { signal },
      ),
  });
}

export function useWhoCan(action: string | null) {
  return useQuery({
    queryKey: ['admin', 'access', 'who-can', action],
    enabled: !!action,
    queryFn: ({ signal }) =>
      apiFetch<
        Array<{ accountId: string; displayName: string; email: string; sources: AccessSource[] }>
      >(`/admin/access/who-can?action=${encodeURIComponent(action!)}`, { signal }),
  });
}

/** Everything that depends on roles / assignments — refresh it all after any access change. */
function useInvalidateAccess() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['admin'] });
  };
}

export function useSaveRole() {
  const done = useInvalidateAccess();
  return useMutation({
    mutationFn: (input: {
      code: string;
      isNew: boolean;
      body: {
        code?: string;
        name: string;
        description?: string | null;
        permissionActions: string[];
        conditions: Record<string, { amountMinorMax?: number }>;
        expectedVersion?: number;
      };
    }) =>
      input.isNew
        ? apiFetch<RoleRow>('/admin/roles', {
            method: 'POST',
            body: { ...input.body, code: input.code },
          })
        : apiFetch<RoleRow>(`/admin/roles/${input.code}`, { method: 'PATCH', body: input.body }),
    onSuccess: done,
  });
}

export function useCloneRole() {
  const done = useInvalidateAccess();
  return useMutation({
    mutationFn: (input: { from: string; code: string; name: string }) =>
      apiFetch<RoleRow>(`/admin/roles/${input.from}/clone`, {
        method: 'POST',
        body: { code: input.code, name: input.name },
      }),
    onSuccess: done,
  });
}

export function useArchiveRole() {
  const done = useInvalidateAccess();
  return useMutation({
    mutationFn: (input: { code: string; archived: boolean }) =>
      apiFetch<RoleRow>(`/admin/roles/${input.code}/${input.archived ? 'archive' : 'restore'}`, {
        method: 'POST',
      }),
    onSuccess: done,
  });
}

export function useApplyMatrix() {
  const done = useInvalidateAccess();
  return useMutation({
    mutationFn: (input: { dryRun?: boolean; changes: MatrixChange[] }) =>
      apiFetch<MatrixResult>('/admin/permissions/matrix', { method: 'PUT', body: input }),
    onSuccess: (_r, vars) => {
      if (!vars.dryRun) done();
    },
  });
}

export function useAssignRole() {
  const done = useInvalidateAccess();
  return useMutation({
    mutationFn: (input: {
      accountId: string;
      roleCode: string;
      validFrom?: string;
      validUntil?: string | null;
      reason?: string;
    }) => {
      const { accountId, ...body } = input;
      return apiFetch<StaffAccess>(`/admin/staff/${accountId}/assignments`, {
        method: 'POST',
        body,
      });
    },
    onSuccess: done,
  });
}

export function useRemoveAssignment() {
  const done = useInvalidateAccess();
  return useMutation({
    mutationFn: (input: { accountId: string; id: string }) =>
      apiFetch<StaffAccess>(`/admin/staff/${input.accountId}/assignments/${input.id}`, {
        method: 'DELETE',
      }),
    onSuccess: done,
  });
}

export function useSetOverride() {
  const done = useInvalidateAccess();
  return useMutation({
    mutationFn: (input: {
      accountId: string;
      action: string;
      effect: 'allow' | 'deny';
      validUntil?: string | null;
      reason: string;
    }) => {
      const { accountId, ...body } = input;
      return apiFetch<StaffAccess>(`/admin/staff/${accountId}/overrides`, { method: 'POST', body });
    },
    onSuccess: done,
  });
}

export function useRemoveOverride() {
  const done = useInvalidateAccess();
  return useMutation({
    mutationFn: (input: { accountId: string; id: string }) =>
      apiFetch<StaffAccess>(`/admin/staff/${input.accountId}/overrides/${input.id}`, {
        method: 'DELETE',
      }),
    onSuccess: done,
  });
}

export function useGroups() {
  return useQuery({
    queryKey: KEYS.groups,
    queryFn: ({ signal }) => apiFetch<StaffGroup[]>('/admin/groups', { signal }),
  });
}

export function useSaveGroup() {
  const done = useInvalidateAccess();
  return useMutation({
    mutationFn: (input: {
      isNew: boolean;
      code: string;
      name: string;
      description?: string;
      accountIds: string[];
    }) =>
      input.isNew
        ? apiFetch<StaffGroup>('/admin/groups', { method: 'POST', body: input })
        : apiFetch<StaffGroup>(`/admin/groups/${input.code}`, { method: 'PUT', body: input }),
    onSuccess: done,
  });
}

export function useArchiveGroup() {
  const done = useInvalidateAccess();
  return useMutation({
    mutationFn: (input: { code: string; archived: boolean }) =>
      apiFetch(`/admin/groups/${input.code}/${input.archived ? 'archive' : 'restore'}`, {
        method: 'POST',
      }),
    onSuccess: done,
  });
}

/** Group the catalogue by module, in a stable order, for the matrix rows. */
export function groupActions(
  actions: PermissionAction[],
): Array<{ group: string; actions: PermissionAction[] }> {
  const map = new Map<string, PermissionAction[]>();
  for (const a of actions) (map.get(a.group) ?? map.set(a.group, []).get(a.group)!).push(a);
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, list]) => ({
      group,
      actions: list.sort((x, y) => x.code.localeCompare(y.code)),
    }));
}
