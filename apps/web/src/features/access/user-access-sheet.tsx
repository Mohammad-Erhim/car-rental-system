import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { sourceLabel } from './who-can-dialog';

import { ChoiceTabs } from '@/components/choice-tabs';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormDialog } from '@/components/form-dialog';
import { ChoiceField, TextField } from '@/components/form-fields';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  groupActions,
  useAssignRole,
  useRemoveAssignment,
  useRemoveOverride,
  useRoles,
  useSetOverride,
  useStaffAccess,
  type PermissionAction,
} from '@/lib/access-hooks';

type Dialog =
  | { kind: 'role' }
  | { kind: 'override' }
  | { kind: 'removeRole'; id: string; name: string }
  | { kind: 'removeOverride'; id: string; action: string };

const toIso = (local: string) => (local ? new Date(local).toISOString() : undefined);

/** One person's access: roles (optionally time-bound), one-off allow/deny exceptions, and what it all adds up to. */
export function UserAccessSheet({
  accountId,
  open,
  onOpenChange,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, fmt } = useI18n();
  const access = useStaffAccess(accountId);
  const roles = useRoles();
  const removeRole = useRemoveAssignment();
  const removeOv = useRemoveOverride();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const catalogue: PermissionAction[] = roles.data?.permissionActions ?? [];
  const groups = useMemo(() => groupActions(catalogue), [catalogue]);
  const a = access.data;
  const close = (o: boolean) => !o && setDialog(null);
  const fail = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : t('ops.access.saveFail'));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeLabel={t('action.close')} className="p-0 sm:max-w-2xl">
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader className="border-b p-6 pe-12">
            <SheetTitle>{a?.staff.displayName ?? t('ops.st.loading')}</SheetTitle>
            <SheetDescription>{a?.staff.email}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-7 overflow-y-auto p-6" data-testid="user-access">
            {access.isLoading ? (
              <Skeleton className="h-64" />
            ) : access.isError || !a ? (
              <StateView kind="error" title={t('ops.access.loadFail')} />
            ) : (
              <>
                <section aria-labelledby="ua-roles">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 id="ua-roles" className="font-semibold">
                      {t('ops.access.roles')}
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDialog({ kind: 'role' })}
                      data-testid="ua-add-role"
                    >
                      <Plus aria-hidden="true" />
                      {t('ops.access.addRole')}
                    </Button>
                  </div>
                  {a.assignments.length ? (
                    <ul className="divide-y rounded-lg border">
                      {a.assignments.map((x) => (
                        <li
                          key={x.id}
                          className="flex flex-wrap items-center justify-between gap-2 p-3"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{x.roleName}</p>
                            <p className="text-xs text-muted-foreground">
                              {x.validUntil
                                ? t('ops.access.until', { date: fmt.dateTime(x.validUntil) })
                                : t('ops.access.permanent')}
                              {x.reason ? ` · ${x.reason}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={x.state === 'active' ? 'success' : 'secondary'}>
                              {t(`ops.access.assignment.${x.state}`)}
                            </Badge>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t('ops.access.removeRole')}
                              onClick={() =>
                                setDialog({ kind: 'removeRole', id: x.id, name: x.roleName })
                              }
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('ops.access.noRoles')}</p>
                  )}
                </section>

                <section aria-labelledby="ua-overrides">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 id="ua-overrides" className="font-semibold">
                      {t('ops.access.overrides')}
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDialog({ kind: 'override' })}
                      data-testid="ua-add-override"
                    >
                      <Plus aria-hidden="true" />
                      {t('ops.access.addOverride')}
                    </Button>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {t('ops.access.overridesHint')}
                  </p>
                  {a.overrides.length ? (
                    <ul className="divide-y rounded-lg border">
                      {a.overrides.map((o) => (
                        <li
                          key={o.id}
                          className="flex flex-wrap items-center justify-between gap-2 p-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {o.effect === 'deny' ? (
                                <Ban className="size-4 text-destructive" aria-hidden="true" />
                              ) : (
                                <ShieldCheck className="size-4 text-success" aria-hidden="true" />
                              )}
                              <span className="bidi-isolate font-mono text-xs">{o.action}</span>
                              <Badge variant={o.effect === 'deny' ? 'destructive' : 'success'}>
                                {t(`ops.access.effect.${o.effect}`)}
                              </Badge>
                              {o.expired ? (
                                <Badge variant="secondary">
                                  {t('ops.access.assignment.expired')}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {o.reason}
                              {o.validUntil
                                ? ` · ${t('ops.access.until', { date: fmt.dateTime(o.validUntil) })}`
                                : ''}
                            </p>
                          </div>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('ops.access.removeOverride')}
                            onClick={() =>
                              setDialog({ kind: 'removeOverride', id: o.id, action: o.action })
                            }
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('ops.access.noOverrides')}</p>
                  )}
                </section>

                {a.groups.length ? (
                  <section>
                    <h3 className="mb-2 font-semibold">{t('ops.access.tab.teams')}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {a.groups.map((g) => (
                        <Badge key={g.code} variant="secondary">
                          {g.name}
                        </Badge>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section aria-labelledby="ua-effective">
                  <h3 id="ua-effective" className="mb-2 flex items-center gap-2 font-semibold">
                    {t('ops.access.effective')}
                    <Badge variant="outline">{a.effective.permissions.length}</Badge>
                  </h3>
                  <div className="space-y-3">
                    {groups.map((g) => (
                      <Fragment key={g.group}>
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {g.group}
                          </p>
                          <ul className="space-y-1">
                            {g.actions.map((p) => {
                              const has = a.effective.permissions.includes(p.code);
                              const denied = a.effective.denied.includes(p.code);
                              const src = a.effective.sources[p.code] ?? [];
                              const limit = a.effective.conditions[p.code]?.amountMinorMax;
                              return (
                                <li
                                  key={p.code}
                                  className={`flex flex-wrap items-center justify-between gap-2 text-sm ${has || denied ? '' : 'opacity-40'}`}
                                >
                                  <span className="bidi-isolate font-mono text-xs">{p.code}</span>
                                  <span className="flex flex-wrap items-center gap-1">
                                    {denied ? (
                                      <Badge variant="destructive">{t('ops.access.denied')}</Badge>
                                    ) : null}
                                    {limit !== undefined ? (
                                      <Badge variant="warning">
                                        {t('ops.access.limitTag', { n: limit / 100 })}
                                      </Badge>
                                    ) : null}
                                    {src.map((s, i) => (
                                      <Badge key={i} variant="secondary">
                                        {sourceLabel(s, t)}
                                      </Badge>
                                    ))}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </Fragment>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>

        {dialog?.kind === 'role' ? (
          <AddRoleDialog accountId={accountId} open onOpenChange={close} />
        ) : null}
        {dialog?.kind === 'override' ? (
          <OverrideDialog accountId={accountId} catalogue={catalogue} open onOpenChange={close} />
        ) : null}
        {dialog?.kind === 'removeRole' ? (
          <ConfirmDialog
            open
            onOpenChange={close}
            destructive
            title={t('ops.access.removeRoleTitle', { name: dialog.name })}
            description={t('ops.access.removeRoleBody')}
            confirmLabel={t('ops.access.removeRole')}
            onConfirm={async () => {
              try {
                await removeRole.mutateAsync({ accountId, id: dialog.id });
                toast.success(t('ops.access.roleRemoved'));
              } catch (e) {
                fail(e);
                throw e;
              }
            }}
          />
        ) : null}
        {dialog?.kind === 'removeOverride' ? (
          <ConfirmDialog
            open
            onOpenChange={close}
            title={t('ops.access.removeOverrideTitle', { action: dialog.action })}
            description={t('ops.access.removeOverrideBody')}
            confirmLabel={t('ops.access.removeOverride')}
            onConfirm={async () => {
              try {
                await removeOv.mutateAsync({ accountId, id: dialog.id });
                toast.success(t('ops.access.overrideRemoved'));
              } catch (e) {
                fail(e);
                throw e;
              }
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function AddRoleDialog({
  accountId,
  open,
  onOpenChange,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const roles = useRoles();
  const assign = useAssignRole();
  const schema = useMemo(
    () =>
      z.object({
        roleCode: z.string().min(1, t('error.field.required')),
        validUntil: z.string(),
        reason: z.string().max(500),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = { roleCode: '', validUntil: '', reason: '' };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.access.addRole')}
      description={t('ops.access.addRoleBody')}
      submitLabel={t('ops.access.addRole')}
      onSubmit={async (v) => {
        await assign.mutateAsync({
          accountId,
          roleCode: v.roleCode,
          validUntil: toIso(v.validUntil) ?? null,
          reason: v.reason.trim() || undefined,
        });
        toast.success(t('ops.access.roleAdded'));
      }}
    >
      <ChoiceField
        control={form.control}
        name="roleCode"
        label={t('ops.access.role')}
        options={(roles.data?.roles ?? [])
          .filter((r) => !r.archived)
          .map((r) => ({ value: r.code, label: r.name, testId: `ua-role-${r.code}` }))}
      />
      <TextField
        control={form.control}
        name="validUntil"
        type="datetime-local"
        label={t('ops.access.validUntil')}
        description={t('ops.access.validUntilHint')}
      />
      <TextField control={form.control} name="reason" label={t('ops.access.reason')} />
    </FormDialog>
  );
}

function OverrideDialog({
  accountId,
  catalogue,
  open,
  onOpenChange,
}: {
  accountId: string;
  catalogue: PermissionAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const set = useSetOverride();
  const schema = useMemo(
    () =>
      z.object({
        action: z.string().min(1, t('error.field.required')),
        effect: z.enum(['allow', 'deny']),
        validUntil: z.string(),
        reason: z.string().trim().min(3, t('ops.access.reasonRequired')).max(500),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = { action: '', effect: 'deny', validUntil: '', reason: '' };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const effect = form.watch('effect');
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={t('ops.access.addOverride')}
      description={t('ops.access.overridesHint')}
      submitLabel={t('ops.access.addOverride')}
      onSubmit={async (v) => {
        await set.mutateAsync({
          accountId,
          action: v.action,
          effect: v.effect,
          validUntil: toIso(v.validUntil) ?? null,
          reason: v.reason.trim(),
        });
        toast.success(t('ops.access.overrideAdded'));
      }}
    >
      <FormField
        control={form.control}
        name="action"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('ops.access.permission')}</FormLabel>
            <PermissionPicker
              catalogue={catalogue}
              value={field.value}
              onChange={field.onChange}
              label={t('ops.access.permission')}
            />
            <FormMessage />
          </FormItem>
        )}
      />
      <RadioGroup
        value={effect}
        onValueChange={(v) => form.setValue('effect', v as 'allow' | 'deny')}
        aria-label={t('ops.access.effectLabel')}
      >
        {(['deny', 'allow'] as const).map((e) => (
          <label
            key={e}
            className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm"
          >
            <RadioGroupItem value={e} className="mt-0.5" />
            <span>
              <span className="block font-medium">{t(`ops.access.effect.${e}`)}</span>
              <span className="block text-muted-foreground">{t(`ops.access.effect.${e}Hint`)}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
      <TextField
        control={form.control}
        name="validUntil"
        type="datetime-local"
        label={t('ops.access.validUntil')}
        description={t('ops.access.validUntilHint')}
      />
      <TextField control={form.control} name="reason" label={t('ops.access.reason')} />
    </FormDialog>
  );
}

/**
 * Picks one permission from the catalogue without a dropdown: the modules are tabs, and the chosen
 * module's permissions are a list of described options — every choice visible, none hidden in a menu.
 */
function PermissionPicker({
  catalogue,
  value,
  onChange,
  label,
}: {
  catalogue: PermissionAction[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const groups = useMemo(() => [...new Set(catalogue.map((c) => c.group))].sort(), [catalogue]);
  const [group, setGroup] = useState(
    () => catalogue.find((c) => c.code === value)?.group ?? groups[0] ?? '',
  );
  return (
    <div className="space-y-2" data-testid="ua-override-picker">
      <ChoiceTabs
        value={group}
        onChange={setGroup}
        label={label}
        options={groups.map((g) => ({ value: g, label: g, testId: `ua-group-${g}` }))}
      />
      <ChoiceTabs
        layout="list"
        value={value}
        onChange={onChange}
        label={`${label} · ${group}`}
        options={catalogue
          .filter((c) => c.group === group)
          .map((c) => ({
            value: c.code,
            label: <span className="bidi-isolate font-mono text-xs">{c.code}</span>,
            description: c.description,
            testId: `ua-action-${c.code}`,
          }))}
      />
    </div>
  );
}
