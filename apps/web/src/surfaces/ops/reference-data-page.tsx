import { useAuth, useFormErrors } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DataTable,
  ErrorSummary,
  Field,
  Input,
  PageHeader,
  type DataTableColumn,
} from '@carrental/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Lock } from 'lucide-react';
import { useState } from 'react';

import { useLookupTypes, useLookupUsage, useLookupValues } from '../../lib/api-hooks.js';
import { apiFetch } from '../../lib/api.js';

/**
 * SCREEN-OPS-030 (catalogue) + SCREEN-OPS-031 (type & values management) combined.
 * Dynamic selectors, editable configurable values, deactivate/restore, read-only system types
 * with reason shown (FR-GBL-004, FR-ADM-008, SRS-LKP-*).
 */
export function ReferenceDataPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('lookup.manage');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>('cancel_reason');
  const types = useLookupTypes(search ? { search } : undefined);

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.ref.title')} description={t('ops.ref.subtitle')} />

      {/* min-w-0 on the grid items so the values table can scroll inside its own box
          instead of forcing the whole column (and the page) wider on small screens */}
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr] [&>*]:min-w-0">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('ops.ref.catalogue')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder={t('action.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('ops.ref.search')}
            />
            {types.isLoading ? (
              <AppStateView kind="loading" title={t('ops.st.loading')} inline />
            ) : types.isError ? (
              <AppStateView
                kind="failure"
                inline
                title={t('ops.st.loadFail', { what: t('ops.ref.title') })}
                primaryAction={{ label: t('ops.st.retry'), onClick: () => types.refetch() }}
              />
            ) : !types.data?.length ? (
              <AppStateView kind="no-results" inline title={t('ops.ref.noTypes')} />
            ) : (
              <ul className="max-h-[28rem] space-y-1 overflow-auto" data-testid="lookup-type-list">
                {types.data.map((tp) => (
                  <li key={tp.code}>
                    <button
                      type="button"
                      onClick={() => setSelected(tp.code)}
                      data-testid={`lookup-type-${tp.code}`}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm ${
                        selected === tp.code ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{tp.code}</span>
                        <span className="block text-xs text-muted-foreground">
                          {tp.classification} ·{' '}
                          {t('ops.ref.activeCount', { n: tp.activeValueCount })}
                        </span>
                      </span>
                      {tp.editability === 'read_only' ? (
                        <Lock
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-label={t('ops.ref.readOnly')}
                        />
                      ) : (
                        <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {selected ? (
          <LookupTypeDetail typeCode={selected} canManage={canManage} />
        ) : (
          <Card>
            <CardContent className="py-12">
              <AppStateView kind="empty" title={t('ops.ref.pickType')} inline />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function LookupTypeDetail({ typeCode, canManage }: { typeCode: string; canManage: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const values = useLookupValues(typeCode, { locale: 'en', includeInactive: true });
  const errs = useFormErrors({ code: t('ops.tbl.code'), label: t('ops.tbl.label') });
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [deactivate, setDeactivate] = useState<{ id: string; code: string } | null>(null);

  const type = values.data?.type;
  const readOnly = type?.editability === 'read_only';
  const usage = useLookupUsage(typeCode, deactivate?.code ?? null);
  const inUse = (usage.data?.totalReferences ?? 0) > 0;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['reference-data'] });

  const create = useMutation({
    mutationFn: () =>
      apiFetch(`/reference-data/types/${typeCode}/values`, {
        method: 'POST',
        body: { code: newCode, label: newLabel },
      }),
    onSuccess: () => {
      setNewCode('');
      setNewLabel('');
      errs.clear();
      void invalidate();
    },
    onError: (e) => errs.fromError(e),
  });

  const setActive = useMutation({
    mutationFn: (input: { id: string; active: boolean; force?: boolean }) =>
      apiFetch(
        `/reference-data/types/${typeCode}/values/${input.id}/${input.active ? 'restore' : 'deactivate'}${
          input.force ? '?force=true' : ''
        }`,
        { method: 'POST' },
      ),
    onSuccess: () => void invalidate(),
  });

  const editLabel = useMutation({
    mutationFn: (input: { id: string; label: string }) =>
      apiFetch(`/reference-data/types/${typeCode}/values/${input.id}`, {
        method: 'POST',
        body: { label: input.label },
      }),
    onSuccess: () => void invalidate(),
  });

  type LookupValue = NonNullable<typeof values.data>['values'][number];
  const columns: Array<DataTableColumn<LookupValue>> = [
    {
      key: 'code',
      header: t('ops.tbl.code'),
      cell: (v) => <span className="bidi-isolate font-mono text-xs">{v.code}</span>,
    },
    {
      key: 'labelEn',
      header: t('ops.ref.labelEn'),
      cell: (v) =>
        readOnly || v.systemManaged ? (
          v.label
        ) : (
          <InlineLabel value={v.label} onSave={(label) => editLabel.mutate({ id: v.id, label })} />
        ),
    },
    {
      key: 'state',
      header: t('ops.tbl.state'),
      cell: (v) =>
        v.isActive ? (
          <Badge variant="success">{t('ops.ref.active')}</Badge>
        ) : (
          <Badge variant="neutral">{t('ops.ref.inactive')}</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (v) =>
        canManage && !readOnly && !v.systemManaged ? (
          v.isActive ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeactivate({ id: v.id, code: v.code })}
              data-testid={`deactivate-${v.code}`}
            >
              {t('ops.ref.deactivate')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setActive.mutate({ id: v.id, active: true })}
            >
              {t('ops.ref.restore')}
            </Button>
          )
        ) : null,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {typeCode}
          {type ? <Badge variant="neutral">{type.classification}</Badge> : null}
          {readOnly ? (
            <Badge variant="warning">
              <Lock className="size-3" aria-hidden="true" /> {t('ops.ref.readOnly')}
            </Badge>
          ) : null}
        </CardTitle>
        {readOnly && type?.lockReason ? (
          <p className="text-sm text-muted-foreground">{type.lockReason}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <DataTable
          columns={columns}
          rows={values.data?.values}
          rowKey={(v) => v.id}
          isLoading={values.isLoading}
          isError={values.isError}
          onRetry={() => values.refetch()}
          rowProps={(v) => ({ 'data-code': v.code, 'data-active': String(v.isActive) })}
          rowClassName="align-top"
          bodyTestid="lookup-value-rows"
          minWidth="30rem"
          labels={{
            loading: t('ops.st.loading'),
            loadFailTitle: t('ops.ref.loadValuesFail'),
            retry: t('ops.st.retry'),
            empty: t('ops.ref.noValues'),
          }}
        />

        {canManage && !readOnly ? (
          <form
            className="space-y-3 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <p className="text-sm font-medium">{t('ops.ref.addValue')}</p>
            <ErrorSummary title={t('state.validation.title')} errors={errs.summary} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('ops.ref.stableCode')}
                htmlFor="field-code"
                required
                error={errs.fieldError('code')}
                hint={t('ops.ref.codeHint')}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={newCode}
                    onChange={(e) =>
                      setNewCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                    }
                    placeholder={t('ops.ref.codePlaceholder')}
                    required
                  />
                )}
              </Field>
              <Field
                label={t('ops.ref.labelEn')}
                htmlFor="field-label"
                required
                error={errs.fieldError('label')}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    required
                  />
                )}
              </Field>
            </div>
            <Button type="submit" size="sm" loading={create.isPending}>
              {t('ops.ref.add')}
            </Button>
          </form>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={!!deactivate}
        onOpenChange={(v) => !v && setDeactivate(null)}
        title={t('ops.ref.deactivateQ')}
        description={
          usage.isLoading
            ? t('ops.st.loading')
            : inUse
              ? t('ops.ref.deactivateInUse', { n: usage.data!.totalReferences })
              : t('ops.ref.deactivateBody')
        }
        confirmLabel={t('ops.ref.deactivate')}
        destructive
        onConfirm={() => {
          if (deactivate) setActive.mutate({ id: deactivate.id, active: false, force: inUse });
        }}
      />
    </Card>
  );
}

function InlineLabel({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <button
        type="button"
        className="rounded px-1 text-start hover:bg-accent"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </button>
    );
  }
  return (
    <span className="flex gap-1">
      <Input
        className="h-8"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label={t('ops.ref.editLabel')}
        autoFocus
      />
      <Button
        size="sm"
        onClick={() => {
          onSave(draft);
          setEditing(false);
        }}
      >
        {t('ops.st.save')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
        {t('ops.st.cancel')}
      </Button>
    </span>
  );
}
