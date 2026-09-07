import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorSummary,
  Field,
  Input,
  PageHeader,
  useToast,
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

  const TH = ['name', 'email', 'roles', 'status'] as const;

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
          {staff.isLoading ? (
            <AppStateView kind="loading" title={t('ops.st.loading')} inline />
          ) : staff.isError ? (
            <AppStateView
              kind="failure"
              inline
              title={t('ops.staff.loadFail')}
              primaryAction={{ label: t('ops.st.retry'), onClick: () => staff.refetch() }}
            />
          ) : !staff.data?.length ? (
            <AppStateView kind="empty" inline title={t('ops.st.none')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="staff-table">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    {TH.map((k) => (
                      <th key={k} className="py-1 text-start font-medium">
                        {t(`ops.tbl.${k}`)}
                      </th>
                    ))}
                    <th className="py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.data.map((s) => (
                    <tr key={s.accountId} className="border-t">
                      <td className="py-2 pe-3 font-medium">{s.displayName}</td>
                      <td className="bidi-isolate py-2 pe-3">{s.email}</td>
                      <td className="py-2 pe-3">
                        <span className="flex flex-wrap gap-1">
                          {s.roleCodes.map((rc) => (
                            <Badge key={rc} variant="neutral">
                              {rc}
                            </Badge>
                          ))}
                        </span>
                      </td>
                      <td className="py-2 pe-3">
                        <Badge variant={s.status === 'active' ? 'success' : 'warning'}>
                          {s.status}
                        </Badge>
                      </td>
                      <td className="py-2 text-end">
                        {s.status === 'active' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              changeStatus.mutate({ accountId: s.accountId, status: 'suspended' })
                            }
                          >
                            {t('ops.staff.suspend')}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              changeStatus.mutate({ accountId: s.accountId, status: 'active' })
                            }
                          >
                            {t('ops.staff.reactivate')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
