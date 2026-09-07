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

  const errs = useFormErrors({ email: 'Email', fullName: 'Full name', roleCodes: 'Roles' });
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
        title: 'Invitation sent',
        description: 'They receive a set-password link.',
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Staff &amp; roles</h1>
        <p className="text-sm text-muted-foreground">
          Invite staff, assign roles, and suspend access. Roles are composed from fixed permission
          actions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite a staff member</CardTitle>
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
              label="Full name"
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
            <Field label="Email" htmlFor="field-email" required error={errs.fieldError('email')}>
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
            <Field label="Role" htmlFor="field-role">
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
              Send invite
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Staff</CardTitle>
        </CardHeader>
        <CardContent>
          {staff.isLoading ? (
            <AppStateView kind="loading" title={t('state.loading.title')} inline />
          ) : staff.isError ? (
            <AppStateView
              kind="failure"
              inline
              title={t('state.failure.title')}
              primaryAction={{ label: t('action.retry'), onClick: () => staff.refetch() }}
            />
          ) : !staff.data?.length ? (
            <AppStateView kind="empty" inline title={t('state.empty.title')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="staff-table">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-1 text-start font-medium">Name</th>
                    <th className="py-1 text-start font-medium">Email</th>
                    <th className="py-1 text-start font-medium">Roles</th>
                    <th className="py-1 text-start font-medium">Status</th>
                    <th className="py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.data.map((s) => (
                    <tr key={s.accountId} className="border-t">
                      <td className="py-2 pe-3 font-medium">{s.displayName}</td>
                      <td className="py-2 pe-3 bidi-isolate">{s.email}</td>
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
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              changeStatus.mutate({ accountId: s.accountId, status: 'active' })
                            }
                          >
                            Reactivate
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
