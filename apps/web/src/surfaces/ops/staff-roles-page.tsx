import { useAuth, useFormErrors } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  DataTable,
  ErrorSummary,
  Field,
  Input,
  PageHeader,
  useToast,
  type DataTableColumn,
} from '@carrental/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { apiFetch } from '../../lib/api.js';
import { useLocations } from '../../lib/discovery-hooks.js';

interface Role {
  code: string;
  name: string;
  isSystem: boolean;
  permissionActions: string[];
}
interface StaffRow {
  accountId: string;
  displayName: string;
  email: string;
  status: 'invited' | 'active' | 'suspended' | 'deactivated';
  roleCodes: string[];
  locationScope: string[];
}

const STATUS_VARIANT: Record<
  StaffRow['status'],
  'success' | 'warning' | 'neutral' | 'destructive'
> = {
  invited: 'neutral',
  active: 'success',
  suspended: 'warning',
  deactivated: 'destructive',
};

/** Checkbox grid for roles — every role code the actor is allowed to grant is selectable; the
 *  `administrator` role is shown but disabled for a non-administrator actor (matches the
 *  server-side "only an administrator can grant administrator" guard in staff.service.ts — this
 *  is a UI hint, not the enforcement; the server rejects it either way). */
function RoleCheckboxes({
  roles,
  selected,
  onToggle,
  canGrantAdmin,
}: {
  roles: Role[];
  selected: string[];
  onToggle: (code: string, on: boolean) => void;
  canGrantAdmin: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {roles.map((r) => {
        const locked = r.code === 'administrator' && !canGrantAdmin;
        return (
          <label
            key={r.code}
            className={`flex items-center gap-2 text-sm ${locked ? 'opacity-50' : ''}`}
            title={locked ? t('ops.staff.adminOnlyHint') : undefined}
          >
            <Checkbox
              checked={selected.includes(r.code)}
              disabled={locked}
              onChange={(e) => onToggle(r.code, e.target.checked)}
            />
            {r.name}
          </label>
        );
      })}
    </div>
  );
}

function LocationCheckboxes({
  locations,
  selected,
  onToggle,
}: {
  locations: Array<{ code: string; name: string }>;
  selected: string[];
  onToggle: (code: string, on: boolean) => void;
}) {
  const { t } = useI18n();
  if (!locations.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {selected.length ? t('ops.staff.scopeHint') : t('ops.staff.scopeAllHint')}
      </p>
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((l) => (
          <label key={l.code} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.includes(l.code)}
              onChange={(e) => onToggle(l.code, e.target.checked)}
            />
            {l.name}
          </label>
        ))}
      </div>
    </div>
  );
}

/** SCREEN-OPS-032 — Staff & roles (FR-ADM-009, FLOW-OPS-015). */
export function StaffRolesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { actor } = useAuth();
  const isAdmin = actor?.roleCodes.includes('administrator') ?? false;

  const roles = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: ({ signal }) =>
      apiFetch<{ roles: Role[]; permissionActions: unknown[] }>('/admin/roles', { signal }),
  });
  const staff = useQuery({
    queryKey: ['admin', 'staff'],
    queryFn: ({ signal }) => apiFetch<StaffRow[]>('/admin/staff', { signal }),
  });
  const locations = useLocations();
  const roleName = useMemo(() => {
    const m = new Map((roles.data?.roles ?? []).map((r) => [r.code, r.name]));
    return (code: string) => m.get(code) ?? code;
  }, [roles.data]);
  const locationName = useMemo(() => {
    const m = new Map((locations.data ?? []).map((l) => [l.code, l.name]));
    return (code: string) => m.get(code) ?? code;
  }, [locations.data]);

  const errs = useFormErrors({
    email: t('ops.tbl.email'),
    fullName: t('ops.staff.fullName'),
    roleCodes: t('ops.tbl.roles'),
  });
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [inviteRoles, setInviteRoles] = useState<string[]>(['rental_agent']);
  const [inviteScope, setInviteScope] = useState<string[]>([]);

  const invite = useMutation({
    mutationFn: () =>
      apiFetch('/admin/staff/invite', {
        method: 'POST',
        body: { email, fullName, roleCodes: inviteRoles, locationScope: inviteScope },
      }),
    onSuccess: () => {
      setEmail('');
      setFullName('');
      setInviteRoles(['rental_agent']);
      setInviteScope([]);
      errs.clear();
      toast({
        title: t('ops.staff.inviteSent'),
        description: t('ops.staff.inviteSentBody'),
        variant: 'success',
      });
      void qc.invalidateQueries({ queryKey: ['admin', 'staff'] });
    },
    onError: (e) => errs.fromError(e),
  });

  // Re-invites an already-invited account: same backend endpoint (it upserts + re-sends the
  // set-password challenge), pre-filled from the row so the admin doesn't retype anything.
  const resend = useMutation({
    mutationFn: (row: StaffRow) =>
      apiFetch('/admin/staff/invite', {
        method: 'POST',
        body: {
          email: row.email,
          fullName: row.displayName,
          roleCodes: row.roleCodes,
          locationScope: row.locationScope,
        },
      }),
    onSuccess: () => {
      toast({ title: t('ops.staff.inviteResent'), variant: 'success' });
      void qc.invalidateQueries({ queryKey: ['admin', 'staff'] });
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : t('ops.staff.statusFail') }),
  });

  interface AccessInput {
    accountId: string;
    body: { roleCodes?: string[]; locationScope?: string[]; status?: StaffRow['status'] };
    successKey: string;
  }
  const access = useMutation({
    mutationFn: (input: AccessInput) =>
      apiFetch(`/admin/staff/${input.accountId}/access`, { method: 'POST', body: input.body }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'staff'] });
      toast({ title: t(v.successKey), variant: 'success' });
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : t('ops.staff.statusFail') }),
  });

  const [statusTarget, setStatusTarget] = useState<{
    accountId: string;
    name: string;
    status: 'suspended' | 'deactivated';
  } | null>(null);

  const [changeTarget, setChangeTarget] = useState<StaffRow | null>(null);
  const [changeRoles, setChangeRoles] = useState<string[]>([]);
  const [changeScope, setChangeScope] = useState<string[]>([]);
  function openChange(row: StaffRow) {
    setChangeTarget(row);
    setChangeRoles(row.roleCodes);
    setChangeScope(row.locationScope);
  }

  type Staff = StaffRow;
  const staffColumns: Array<DataTableColumn<Staff>> = [
    {
      key: 'name',
      header: t('ops.tbl.name'),
      cell: (s) => s.displayName,
      className: 'font-medium',
    },
    { key: 'email', header: t('ops.tbl.email'), cell: (s) => s.email, className: 'bidi-isolate' },
    {
      key: 'roles',
      header: t('ops.tbl.roles'),
      cell: (s) => (
        <span className="flex flex-wrap gap-1">
          {s.roleCodes.map((rc) => (
            <Badge key={rc} variant="neutral">
              {roleName(rc)}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      key: 'scope',
      header: t('ops.tbl.location'),
      cell: (s) =>
        s.locationScope.length ? (
          <span className="text-xs text-muted-foreground">
            {s.locationScope.map(locationName).join(', ')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{t('ops.header.allLocations')}</span>
        ),
    },
    {
      key: 'status',
      header: t('ops.tbl.status'),
      cell: (s) => (
        <Badge variant={STATUS_VARIANT[s.status]}>{t(`ops.staff.status.${s.status}`)}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (s) => (
        <span className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => openChange(s)}>
            {t('ops.staff.change')}
          </Button>
          {s.status === 'invited' ? (
            <Button
              size="sm"
              variant="ghost"
              loading={resend.isPending}
              onClick={() => resend.mutate(s)}
            >
              {t('ops.staff.resendInvite')}
            </Button>
          ) : null}
          {s.status === 'active' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setStatusTarget({
                  accountId: s.accountId,
                  name: s.displayName,
                  status: 'suspended',
                })
              }
            >
              {t('ops.staff.suspend')}
            </Button>
          ) : null}
          {s.status === 'suspended' || s.status === 'deactivated' ? (
            <Button
              size="sm"
              variant="ghost"
              loading={access.isPending}
              onClick={() =>
                access.mutate({
                  accountId: s.accountId,
                  body: { status: 'active' },
                  successKey: 'ops.staff.reactivatedMsg',
                })
              }
            >
              {t('ops.staff.reactivate')}
            </Button>
          ) : null}
          {s.status === 'active' || s.status === 'suspended' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setStatusTarget({
                  accountId: s.accountId,
                  name: s.displayName,
                  status: 'deactivated',
                })
              }
            >
              {t('ops.staff.deactivate')}
            </Button>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.staff.title')} description={t('ops.staff.subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.staff.invite')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ErrorSummary title={t('state.validation.title')} errors={errs.summary} />
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('ops.staff.fullName')}
                htmlFor="field-fullName"
                required
                error={errs.fieldError('fullName')}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                )}
              </Field>
              <Field
                label={t('ops.tbl.email')}
                htmlFor="field-email"
                required
                error={errs.fieldError('email')}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                )}
              </Field>
            </div>
            <Field
              label={t('ops.tbl.roles')}
              htmlFor="field-roles"
              required
              error={errs.fieldError('roleCodes')}
            >
              {() => (
                <RoleCheckboxes
                  roles={roles.data?.roles ?? []}
                  selected={inviteRoles}
                  canGrantAdmin={isAdmin}
                  onToggle={(code, on) =>
                    setInviteRoles((prev) =>
                      on ? [...prev, code] : prev.filter((c) => c !== code),
                    )
                  }
                />
              )}
            </Field>
            <Field label={t('ops.staff.locationScope')} htmlFor="field-scope">
              {() => (
                <LocationCheckboxes
                  locations={locations.data ?? []}
                  selected={inviteScope}
                  onToggle={(code, on) =>
                    setInviteScope((prev) =>
                      on ? [...prev, code] : prev.filter((c) => c !== code),
                    )
                  }
                />
              )}
            </Field>
            <div className="flex justify-end">
              <Button type="submit" loading={invite.isPending} disabled={!inviteRoles.length}>
                {t('ops.staff.inviteAction')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.staff.card')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={staffColumns}
            rows={staff.data}
            rowKey={(s) => s.accountId}
            isLoading={staff.isLoading}
            isError={staff.isError}
            onRetry={() => staff.refetch()}
            testid="staff-table"
            minWidth="0"
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.staff.loadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.st.none'),
            }}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!statusTarget}
        onOpenChange={(v) => !v && setStatusTarget(null)}
        destructive
        title={
          statusTarget?.status === 'deactivated'
            ? t('ops.staff.deactivateTitle', { name: statusTarget.name })
            : t('ops.staff.suspendTitle', { name: statusTarget?.name ?? '' })
        }
        description={
          statusTarget?.status === 'deactivated'
            ? t('ops.staff.deactivateBody')
            : t('ops.staff.suspendBody')
        }
        confirmLabel={
          statusTarget?.status === 'deactivated'
            ? t('ops.staff.deactivate')
            : t('ops.staff.suspend')
        }
        onConfirm={async () => {
          if (!statusTarget) return;
          await access.mutateAsync({
            accountId: statusTarget.accountId,
            body: { status: statusTarget.status },
            successKey:
              statusTarget.status === 'deactivated'
                ? 'ops.staff.deactivatedMsg'
                : 'ops.staff.suspendedMsg',
          });
        }}
      />

      <ConfirmDialog
        open={!!changeTarget}
        onOpenChange={(v) => !v && setChangeTarget(null)}
        title={t('ops.staff.changeTitle', { name: changeTarget?.displayName ?? '' })}
        description={
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">{t('ops.tbl.roles')}</p>
              <RoleCheckboxes
                roles={roles.data?.roles ?? []}
                selected={changeRoles}
                canGrantAdmin={isAdmin}
                onToggle={(code, on) =>
                  setChangeRoles((prev) => (on ? [...prev, code] : prev.filter((c) => c !== code)))
                }
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{t('ops.staff.locationScope')}</p>
              <LocationCheckboxes
                locations={locations.data ?? []}
                selected={changeScope}
                onToggle={(code, on) =>
                  setChangeScope((prev) => (on ? [...prev, code] : prev.filter((c) => c !== code)))
                }
              />
            </div>
          </div>
        }
        confirmLabel={t('ops.staff.change')}
        confirmDisabled={!changeRoles.length}
        onConfirm={async () => {
          if (!changeTarget) return;
          await access.mutateAsync({
            accountId: changeTarget.accountId,
            body: { roleCodes: changeRoles, locationScope: changeScope },
            successKey: 'ops.staff.changeSaved',
          });
        }}
      />
    </div>
  );
}
