import { useI18n } from '@carrental/i18n/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, ArchiveRestore, Pencil, Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { TextField, TextareaField } from '@/components/form-fields';
import { FormSection } from '@/components/form-section';
import { FormSheet } from '@/components/form-sheet';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useArchiveGroup,
  useGroups,
  useSaveGroup,
  useUsersMatrix,
  type StaffGroup,
} from '@/lib/access-hooks';

const CODE = /^[a-z][a-z0-9_]{1,39}$/;
// applied on every keystroke, so it must not strip a trailing "_" the person is still typing
const slug = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .slice(0, 40);

/** Teams ("Fleet desk", "Finance approvers") — people grouped so a workflow step or a report can address them together. */
export function GroupsTab() {
  const { t } = useI18n();
  const groups = useGroups();
  const archive = useArchiveGroup();
  const [edit, setEdit] = useState<StaffGroup | 'new' | null>(null);

  if (groups.isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (groups.isError || !groups.data) {
    return (
      <StateView
        kind="error"
        title={t('ops.access.loadFail')}
        actionLabel={t('ops.st.retry')}
        onAction={() => void groups.refetch()}
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEdit('new')} data-testid="group-new">
          <Plus aria-hidden="true" />
          {t('ops.access.newTeam')}
        </Button>
      </div>
      {groups.data.length ? (
        <div className="grid gap-4 md:grid-cols-2" data-testid="groups-list">
          {groups.data.map((g) => (
            <Card key={g.code} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <Users className="size-4 text-primary" aria-hidden="true" />
                    {g.name}
                    {g.archived ? (
                      <Badge variant="secondary">{t('ops.access.archivedTag')}</Badge>
                    ) : null}
                  </h3>
                  <p className="bidi-isolate font-mono text-xs text-muted-foreground">{g.code}</p>
                  {g.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{g.description}</p>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('ops.access.editTeam')}
                    onClick={() => setEdit(g)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={
                      g.archived ? t('ops.access.restoreRole') : t('ops.access.archiveRole')
                    }
                    onClick={async () => {
                      try {
                        await archive.mutateAsync({ code: g.code, archived: !g.archived });
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : t('ops.access.saveFail'));
                      }
                    }}
                  >
                    {g.archived ? (
                      <ArchiveRestore aria-hidden="true" />
                    ) : (
                      <Archive aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {g.members.length ? (
                  g.members.map((m) => (
                    <Badge key={m.accountId} variant="secondary">
                      {m.displayName}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">{t('ops.access.noMembers')}</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <StateView
          icon={Users}
          title={t('ops.access.noTeams')}
          description={t('ops.access.noTeamsBody')}
        />
      )}
      {edit ? (
        <GroupSheet
          group={edit === 'new' ? null : edit}
          open
          onOpenChange={(o) => !o && setEdit(null)}
        />
      ) : null}
    </div>
  );
}

function GroupSheet({
  group,
  open,
  onOpenChange,
}: {
  group: StaffGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const save = useSaveGroup();
  const people = useUsersMatrix();
  const editing = group !== null;
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('error.field.required')).max(120),
        code: editing
          ? z.string()
          : z.string().refine((v) => CODE.test(v), { message: t('ops.access.codeInvalid') }),
        description: z.string().max(500),
        accountIds: z.array(z.string()),
      }),
    [t, editing],
  );
  type Values = z.infer<typeof schema>;
  const defaults: Values = {
    name: group?.name ?? '',
    code: group?.code ?? '',
    description: group?.description ?? '',
    accountIds: group?.members.map((m) => m.accountId) ?? [],
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const ids = form.watch('accountIds');
  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      defaultValues={defaults}
      title={editing ? t('ops.access.editTeam') : t('ops.access.newTeam')}
      submitLabel={t('ops.access.saveRole')}
      onSubmit={async (v) => {
        await save.mutateAsync({
          isNew: !editing,
          code: editing ? group.code : v.code,
          name: v.name.trim(),
          description: v.description.trim() || undefined,
          accountIds: v.accountIds,
        });
        toast.success(t('ops.access.teamSaved'));
      }}
    >
      <FormSection title={t('ops.access.roleDetails')}>
        <TextField control={form.control} name="name" label={t('ops.access.roleName')} />
        {editing ? null : (
          <TextField
            control={form.control}
            name="code"
            label={t('ops.access.roleCode')}
            description={t('ops.access.roleCodeHint')}
            normalize={slug}
          />
        )}
        <TextareaField
          control={form.control}
          name="description"
          label={t('ops.access.roleDescription')}
          rows={2}
        />
      </FormSection>
      <FormSection
        title={t('ops.access.members')}
        hint={t('ops.prod.scopeSome', { n: ids.length })}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {(people.data?.staff ?? []).map((s) => (
            <label
              key={s.accountId}
              className="flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 text-sm"
            >
              <Checkbox
                checked={ids.includes(s.accountId)}
                onCheckedChange={(v) =>
                  form.setValue(
                    'accountIds',
                    v === true ? [...ids, s.accountId] : ids.filter((x) => x !== s.accountId),
                    { shouldDirty: true },
                  )
                }
              />
              <span className="min-w-0 flex-1 truncate">{s.displayName}</span>
            </label>
          ))}
        </div>
      </FormSection>
    </FormSheet>
  );
}
