import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { CheckboxGroupField, TextField } from '@/components/form-fields';
import { FormSection } from '@/components/form-section';
import { FormSheet } from '@/components/form-sheet';
import {
  LocationScopeField,
  scopeIssue,
  scopeModeOf,
  type ScopeMode,
  type ScopeOption,
} from '@/components/location-scope-field';
import {
  useInviteStaff,
  useStaffAccessChange,
  useStaffRoles,
  type StaffRow,
} from '@/lib/admin-hooks';
import { useLocationScope } from '@/lib/location-scope';

interface Values {
  fullName: string;
  email: string;
  roleCodes: string[];
  locationScope: string[];
  scopeMode: ScopeMode;
}

/**
 * Invite a staff member (`staff` null), or change one's roles and location scope. Only an
 * administrator can grant the administrator role — shown locked here as a hint; the API enforces it.
 * "All locations" is an explicit choice, never an empty checklist.
 */
export function StaffSheet({
  staff,
  open,
  onOpenChange,
}: {
  staff: StaffRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { actor } = useAuth();
  const isAdmin = actor?.roleCodes.includes('administrator') ?? false;
  const editing = staff !== null;
  const roles = useStaffRoles();
  const { options, restricted } = useLocationScope();
  const invite = useInviteStaff();
  const change = useStaffAccessChange();

  const schema = useMemo(
    () =>
      z
        .object({
          fullName: editing ? z.string() : z.string().trim().min(1, t('error.field.required')),
          email: editing ? z.string() : z.string().trim().email(t('ops.loc.emailInvalid')),
          roleCodes: z.array(z.string()).min(1, t('ops.staff.roleRequired')),
          locationScope: z.array(z.string()),
          scopeMode: z.enum(['all', 'specific']),
        })
        .refine((v) => !scopeIssue(v.scopeMode, v.locationScope), {
          path: ['locationScope'],
          message: t('ops.scope.pickOne'),
        }),
    [t, editing],
  );
  const defaults: Values = {
    fullName: staff?.displayName ?? '',
    email: staff?.email ?? '',
    roleCodes: staff?.roleCodes ?? ['rental_agent'],
    locationScope: staff?.locationScope ?? [],
    scopeMode: scopeModeOf(staff?.locationScope ?? []),
  };
  // what the person granting access may grant: their own locations (an org-wide granter: all of
  // them), plus any archived branch already in this member's scope so it can be taken off
  const scopeOptions = useMemo(() => {
    const base: ScopeOption[] = options
      .filter((o) => o.status === 'active')
      .map((o) => ({ value: o.code, label: o.name }));
    for (const code of staff?.locationScope ?? []) {
      if (!base.some((b) => b.value === code)) {
        const o = options.find((x) => x.code === code);
        base.push({ value: code, label: o?.name ?? code, archived: true });
      }
    }
    return base;
  }, [options, staff?.locationScope]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={
        editing ? t('ops.staff.changeTitle', { name: staff.displayName }) : t('ops.staff.invite')
      }
      description={editing ? staff.email : t('ops.staff.inviteHint')}
      submitLabel={editing ? t('ops.staff.saveAccess') : t('ops.staff.inviteAction')}
      onSubmit={async (v) => {
        if (editing) {
          await change.mutateAsync({
            accountId: staff.accountId,
            body: {
              roleCodes: v.roleCodes,
              locationScope: v.scopeMode === 'all' ? [] : v.locationScope,
            },
            successKey: 'ops.staff.changeSaved',
          });
          toast.success(t('ops.staff.changeSaved'));
        } else {
          await invite.mutateAsync({
            email: v.email.trim(),
            fullName: v.fullName.trim(),
            roleCodes: v.roleCodes,
            locationScope: v.scopeMode === 'all' ? [] : v.locationScope,
          });
          toast.success(t('ops.staff.inviteSent'), { description: t('ops.staff.inviteSentBody') });
        }
      }}
    >
      {editing ? null : (
        <FormSection title={t('ops.staff.secPerson')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="fullName"
              label={t('ops.staff.fullName')}
              autoFocus
              data-testid="staff-name"
            />
            <TextField
              control={form.control}
              name="email"
              label={t('ops.tbl.email')}
              type="email"
              autoComplete="off"
              data-testid="staff-email"
            />
          </div>
        </FormSection>
      )}
      <FormSection title={t('ops.tbl.roles')}>
        <CheckboxGroupField
          control={form.control}
          name="roleCodes"
          label={t('ops.tbl.roles')}
          options={(roles.data?.roles ?? []).map((r) => ({ value: r.code, label: r.name }))}
          disabledValues={isAdmin ? [] : ['administrator']}
          disabledHint={t('ops.staff.adminOnlyHint')}
          testId="staff-roles"
        />
      </FormSection>
      <FormSection title={t('ops.staff.locationScope')} hint={t('ops.staff.scopeIntro')}>
        <LocationScopeField
          control={form.control}
          name="locationScope"
          modeName="scopeMode"
          label={t('ops.staff.locationScope')}
          restricted={restricted}
          allLabel={t('ops.staff.scopeAll')}
          allHint={t('ops.staff.scopeAllHelp')}
          specificLabel={t('ops.staff.scopeSpecific')}
          specificHint={t('ops.staff.scopeSpecificHint')}
          options={scopeOptions}
          testId="staff-scope"
        />
      </FormSection>
    </FormSheet>
  );
}
