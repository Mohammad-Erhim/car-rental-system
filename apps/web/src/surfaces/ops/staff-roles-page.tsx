import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  ErrorSummary,
  Field,
  Input,
  PageHeader,
  useToast,
  type DataTableColumn,
} from '@carrental/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { apiFetch } from '../../lib/api.js';
import { useFormErrors } from '../../lib/use-form-errors.js';

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
  status: string;
  roleCodes: string[];
  locationScope: string[];
}

/** SCREEN-OPS-032 — Staff & roles (FR-ADM-009, FLOW-OPS-015). */
export function StaffRolesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { toast } = useToast();
  const roles = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: ({ signal }) =>
      apiFetch<{ roles: Role[]; permissionActions: unknown[] }>('/admin/roles', { signal }),
  });
  const staff = useQuery({
    queryKey: ['admin', 'staff'],
    queryFn: ({ signal }) => apiFetch<StaffRow[]>('/admin/staff', { signal }),
  });

  const errs = useFormErrors({
    email: t('ops.tbl.email'),
    fullName: t('ops.staff.fullName'),
    roleCodes: t('ops.tbl.roles'),
  });
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleCode, setRoleCode] = useState('rental_agent');

  const invite = useMutation({
    mutationFn: () =>
      apiFetch('/admin/staff/invite', {
        method: 'POST',
        body: { email, fullName, roleCodes: [roleCode] },
      }),
    onSuccess: () => {
      setEmail('');
      setFullName('');
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

  const changeStatus = useMutation({
    mutationFn: (input: { accountId: string; status: 'active' | 'suspended' }) =>
      apiFetch(`/admin/staff/${input.accountId}/access`, {
        method: 'POST',
        body: { status: input.status },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'staff'] }),
  });

  type Staff = NonNullable<typeof staff.data>[number];
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
              {rc}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('ops.tbl.status'),
      cell: (s) => (
        <Badge variant={s.status === 'active' ? 'success' : 'warning'}>{s.status}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (s) =>
        s.status === 'active' ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => changeStatus.mutate({ accountId: s.accountId, status: 'suspended' })}
          >
            {t('ops.staff.suspend')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => changeStatus.mutate({ accountId: s.accountId, status: 'active' })}
          >
            {t('ops.staff.reactivate')}
          </Button>
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
        <CardContent>
          <ErrorSummary title={t('state.validation.title')} errors={errs.summary} />
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_12rem_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
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
            <Field label={t('ops.staff.role')} htmlFor="field-role">
              {({ id }) => (
                <select
                  id={id}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={roleCode}
                  onChange={(e) => setRoleCode(e.target.value)}
                >
                  {(roles.data?.roles ?? []).map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Button type="submit" loading={invite.isPending}>
              {t('ops.staff.inviteAction')}
            </Button>
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
    </div>
  );
}
