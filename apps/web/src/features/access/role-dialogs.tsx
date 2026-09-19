import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormDialog } from '@/components/form-dialog';
import { TextField, TextareaField } from '@/components/form-fields';
import { FormSection } from '@/components/form-section';
import { FormSheet } from '@/components/form-sheet';
import { useCloneRole, useSaveRole, type RoleRow } from '@/lib/access-hooks';

const CODE = /^[a-z][a-z0-9_]{1,39}$/;
// applied on every keystroke, so it must not strip a trailing "_" the person is still typing
const slug = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .slice(0, 40);

/** Create a role (a blank one — permissions are ticked in the matrix) or edit a custom role's details and refund limit. */
export function RoleSheet({
  role,
  open,
  onOpenChange,
}: {
  role: RoleRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const save = useSaveRole();
  const editing = role !== null;
  // a limit only makes sense on a permission the role actually grants — set it after ticking
  // `payment.refund` in the grid (a new role starts empty)
  const canLimit = editing && role.permissionActions.includes('payment.refund');

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('error.field.required')).max(120),
        code: editing
          ? z.string()
          : z.string().refine((v) => CODE.test(v), { message: t('ops.access.codeInvalid') }),
        description: z.string().max(500),
        refundLimit: z
          .string()
          .trim()
          .refine((v) => v === '' || /^\d+(\.\d{1,2})?$/.test(v), {
            message: t('error.field.invalid'),
          }),
      }),
    [t, editing],
  );
  type Values = z.infer<typeof schema>;
  const cap = role?.conditions['payment.refund']?.amountMinorMax;
  const defaults: Values = {
    name: role?.name ?? '',
    code: role?.code ?? '',
    description: role?.description ?? '',
    refundLimit: cap === undefined ? '' : String(cap / 100),
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={editing ? t('ops.access.editRoleTitle', { name: role.name }) : t('ops.access.newRole')}
      description={t('ops.access.roleSheetHint')}
      submitLabel={editing ? t('ops.access.saveRole') : t('ops.access.createRole')}
      onSubmit={async (v) => {
        const conditions: Record<string, { amountMinorMax?: number }> =
          v.refundLimit === ''
            ? {}
            : { 'payment.refund': { amountMinorMax: Math.round(Number(v.refundLimit) * 100) } };
        await save.mutateAsync({
          code: editing ? role.code : v.code,
          isNew: !editing,
          body: {
            name: v.name.trim(),
            // create rejects null; an edit may clear the description
            description: editing ? v.description.trim() || null : v.description.trim() || undefined,
            permissionActions: role?.permissionActions ?? [],
            conditions: canLimit ? conditions : (role?.conditions ?? {}),
            expectedVersion: role?.version,
          },
        });
        toast.success(t(editing ? 'ops.access.roleSaved' : 'ops.access.roleCreated'));
      }}
    >
      <FormSection title={t('ops.access.roleDetails')}>
        <TextField
          control={form.control}
          name="name"
          label={t('ops.access.roleName')}
          data-testid="role-name"
        />
        {editing ? null : (
          <TextField
            control={form.control}
            name="code"
            label={t('ops.access.roleCode')}
            description={t('ops.access.roleCodeHint')}
            normalize={slug}
            data-testid="role-code"
          />
        )}
        <TextareaField
          control={form.control}
          name="description"
          label={t('ops.access.roleDescription')}
          rows={2}
        />
      </FormSection>
      {editing && !canLimit ? (
        <p className="text-sm text-muted-foreground" data-testid="role-limit-note">
          {t('ops.access.limitNeedsRefund')}
        </p>
      ) : null}
      {canLimit ? (
        <FormSection title={t('ops.access.limits')} hint={t('ops.access.limitsHint')}>
          <TextField
            control={form.control}
            name="refundLimit"
            label={t('ops.access.refundLimit')}
            description={t('ops.access.refundLimitHint')}
            inputMode="decimal"
            data-testid="role-refund-limit"
          />
        </FormSection>
      ) : null}
    </FormSheet>
  );
}

export function CloneRoleDialog({
  role,
  open,
  onOpenChange,
}: {
  role: RoleRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const clone = useCloneRole();
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('error.field.required')).max(120),
        code: z.string().refine((v) => CODE.test(v), { message: t('ops.access.codeInvalid') }),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = { name: `${role.name} (copy)`, code: slug(`${role.code}_copy`) };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.access.cloneTitle', { name: role.name })}
      description={t('ops.access.cloneBody')}
      submitLabel={t('ops.access.cloneRole')}
      onSubmit={async (v) => {
        await clone.mutateAsync({ from: role.code, code: v.code, name: v.name.trim() });
        toast.success(t('ops.access.roleCreated'));
      }}
    >
      <TextField control={form.control} name="name" label={t('ops.access.roleName')} />
      <TextField
        control={form.control}
        name="code"
        label={t('ops.access.roleCode')}
        description={t('ops.access.roleCodeHint')}
        normalize={slug}
      />
    </FormDialog>
  );
}
