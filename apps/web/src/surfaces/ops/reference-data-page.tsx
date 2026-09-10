import { useAuth, useDebounced, useFormErrors } from '@carrental/client/react';
import type { LookupValue } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ErrorSummary,
  Field,
  Input,
  PageHeader,
  useToast,
  type DataTableColumn,
} from '@carrental/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ChevronUp, Lock, Plus } from 'lucide-react';
import { useState } from 'react';

import {
  useLookupTypes,
  useLookupUsage,
  useLookupValues,
  useMetaLocales,
} from '../../lib/api-hooks.js';
import { apiFetch } from '../../lib/api.js';

/**
 * SCREEN-OPS-030 (catalogue) + SCREEN-OPS-031 (type & values management) combined.
 * Dynamic selectors, editable configurable values (label per locale, default, order),
 * deactivate/restore, read-only system types with reason shown (FR-GBL-004, FR-ADM-008,
 * SRS-LKP-*).
 */
export function ReferenceDataPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('lookup.manage');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search.trim());
  const [selected, setSelected] = useState<string | null>('cancel_reason');
  const types = useLookupTypes(debouncedSearch ? { search: debouncedSearch } : undefined);

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
          <LookupTypeDetail key={selected} typeCode={selected} canManage={canManage} />
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

interface ActiveLocale {
  code: string;
  englishName: string;
}

function LookupTypeDetail({ typeCode, canManage }: { typeCode: string; canManage: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const values = useLookupValues(typeCode, { locale: 'en', includeInactive: true });
  const localesQuery = useMetaLocales();
  const [deactivate, setDeactivate] = useState<{ id: string; code: string } | null>(null);
  const [editor, setEditor] = useState<
    { mode: 'create' } | { mode: 'edit'; value: LookupValue } | null
  >(null);

  const rows = values.data?.values ?? [];
  const type = values.data?.type;
  const readOnly = type?.editability === 'read_only';
  const editable = canManage && !readOnly;

  const usage = useLookupUsage(typeCode, deactivate?.code ?? null);
  const inUse = (usage.data?.totalReferences ?? 0) > 0;

  // en first, then the other active launch locales; drop test-only locales
  const locales: ActiveLocale[] = (() => {
    const all = (localesQuery.data?.locales ?? [])
      .filter((l) => !l.testOnly)
      .map((l) => ({ code: l.code, englishName: l.englishName }));
    if (!all.some((l) => l.code === 'en')) all.unshift({ code: 'en', englishName: 'English' });
    return [...all].sort((a, b) =>
      a.code === 'en' ? -1 : b.code === 'en' ? 1 : a.code.localeCompare(b.code),
    );
  })();

  const invalidate = () => qc.invalidateQueries({ queryKey: ['reference-data'] });
  const { toast } = useToast();
  const onMutError = (e: unknown) =>
    toast({ title: e instanceof Error ? e.message : t('ops.ref.actionFail') });

  const setActive = useMutation({
    mutationFn: (input: { id: string; active: boolean; force?: boolean }) =>
      apiFetch(
        `/reference-data/types/${typeCode}/values/${input.id}/${input.active ? 'restore' : 'deactivate'}${
          input.force ? '?force=true' : ''
        }`,
        { method: 'POST' },
      ),
    onSuccess: (_d, input) => {
      toast({
        title: input.active ? t('ops.ref.restored') : t('ops.ref.deactivated'),
        variant: 'success',
      });
      void invalidate();
    },
    onError: onMutError,
  });

  const reorder = useMutation({
    mutationFn: (order: Array<{ id: string; sortOrder: number }>) =>
      apiFetch(`/reference-data/types/${typeCode}/reorder`, { method: 'POST', body: { order } }),
    onSuccess: () => {
      toast({ title: t('ops.ref.reordered'), variant: 'success' });
      void invalidate();
    },
    onError: onMutError,
  });

  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= rows.length || reorder.isPending) return;
    const next = [...rows];
    [next[index], next[to]] = [next[to]!, next[index]!];
    reorder.mutate(next.map((v, i) => ({ id: v.id, sortOrder: i })));
  };

  const columns: Array<DataTableColumn<LookupValue>> = [
    ...(editable
      ? [
          {
            key: 'order',
            header: '',
            className: 'w-12',
            cell: (v: LookupValue) => {
              const i = rows.findIndex((r) => r.id === v.id);
              return (
                <span className="flex flex-col">
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                    aria-label={t('ops.ref.moveUp')}
                    disabled={i <= 0 || reorder.isPending}
                    onClick={() => move(i, -1)}
                  >
                    <ChevronUp className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                    aria-label={t('ops.ref.moveDown')}
                    disabled={i < 0 || i >= rows.length - 1 || reorder.isPending}
                    onClick={() => move(i, 1)}
                  >
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </button>
                </span>
              );
            },
          },
        ]
      : []),
    {
      key: 'code',
      header: t('ops.tbl.code'),
      cell: (v) => <span className="bidi-isolate font-mono text-xs">{v.code}</span>,
    },
    {
      key: 'labelEn',
      header: t('ops.ref.labelEn'),
      cell: (v) => (
        <span>
          <span className="block">{v.label}</span>
          <LocaleCoverage translations={v.translations} locales={locales} />
        </span>
      ),
    },
    {
      key: 'state',
      header: t('ops.tbl.state'),
      cell: (v) => (
        <span className="flex flex-wrap items-center gap-1">
          {v.isActive ? (
            <Badge variant="success">{t('ops.ref.active')}</Badge>
          ) : (
            <Badge variant="neutral">{t('ops.ref.inactive')}</Badge>
          )}
          {v.isDefault ? <Badge variant="neutral">{t('ops.ref.default')}</Badge> : null}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (v) =>
        editable ? (
          <span className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditor({ mode: 'edit', value: v })}
              data-testid={`edit-${v.code}`}
            >
              {t('ops.ref.edit')}
            </Button>
            {v.systemManaged ? null : v.isActive ? (
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
            )}
          </span>
        ) : null,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
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
          </div>
          {editable ? (
            <Button size="sm" onClick={() => setEditor({ mode: 'create' })} data-testid="add-value">
              <Plus className="size-4" aria-hidden="true" /> {t('ops.ref.addValueBtn')}
            </Button>
          ) : null}
        </div>
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
          bodyTestid="lookup-value-rows"
          minWidth="34rem"
          labels={{
            loading: t('ops.st.loading'),
            loadFailTitle: t('ops.ref.loadValuesFail'),
            retry: t('ops.st.retry'),
            empty: t('ops.ref.noValues'),
          }}
        />
      </CardContent>

      {editor ? (
        <ValueEditor
          key={`${editor.mode === 'edit' ? editor.value.id : 'new'}:${locales.map((l) => l.code).join(',')}`}
          typeCode={typeCode}
          locales={locales}
          existingCodes={rows.map((r) => r.code)}
          value={editor.mode === 'edit' ? editor.value : null}
          onSaved={() => {
            setEditor(null);
            void invalidate();
          }}
          onClose={() => setEditor(null)}
        />
      ) : null}

      <ConfirmDialog
        open={!!deactivate}
        onOpenChange={(v) => !v && setDeactivate(null)}
        title={t('ops.ref.deactivateQ')}
        description={
          usage.isLoading
            ? t('ops.ref.checkingUsage')
            : usage.isError
              ? t('ops.ref.usageUnknown')
              : inUse
                ? t('ops.ref.deactivateInUse', { n: usage.data!.totalReferences })
                : t('ops.ref.deactivateBody')
        }
        confirmLabel={t('ops.ref.deactivate')}
        destructive
        confirmDisabled={usage.isLoading}
        onConfirm={async () => {
          if (deactivate)
            await setActive.mutateAsync({ id: deactivate.id, active: false, force: inUse });
        }}
      />
    </Card>
  );
}

/** small "en · fr · —" line under a label showing which locales have their own translation */
function LocaleCoverage({
  translations,
  locales,
}: {
  translations: Record<string, string>;
  locales: ActiveLocale[];
}) {
  if (locales.length <= 1) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1 text-[0.7rem] uppercase text-muted-foreground">
      {locales.map((l) => (
        <span
          key={l.code}
          className={translations[l.code]?.trim() ? 'font-medium text-foreground/70' : 'opacity-50'}
        >
          {l.code}
        </span>
      ))}
    </span>
  );
}

function ValueEditor({
  typeCode,
  locales,
  existingCodes,
  value,
  onSaved,
  onClose,
}: {
  typeCode: string;
  locales: ActiveLocale[];
  existingCodes: string[];
  value: LookupValue | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const isEdit = !!value;
  const errs = useFormErrors({
    code: t('ops.ref.stableCode'),
    label: t('ops.ref.labelEn'),
  });

  const [code, setCode] = useState(value?.code ?? '');
  const [labels, setLabels] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const l of locales) seed[l.code] = value?.translations?.[l.code] ?? '';
    if (value && !seed.en) seed.en = value.label;
    return seed;
  });
  const [isDefault, setIsDefault] = useState(value?.isDefault ?? false);

  const enLabel = (labels.en ?? '').trim();
  const codeValid = /^[a-z0-9_]+$/.test(code);
  const dupCode = !isEdit && existingCodes.includes(code);
  const canSubmit = enLabel.length > 0 && (isEdit || (codeValid && !dupCode));

  const save = useMutation({
    mutationFn: () => {
      const translations: Record<string, string> = {};
      for (const l of locales)
        if (l.code !== 'en') translations[l.code] = (labels[l.code] ?? '').trim();
      if (isEdit) {
        return apiFetch(`/reference-data/types/${typeCode}/values/${value!.id}`, {
          method: 'POST',
          body: { label: enLabel, translations, isDefault },
          ifMatch: value!.version,
        });
      }
      return apiFetch(`/reference-data/types/${typeCode}/values`, {
        method: 'POST',
        body: { code, label: enLabel, translations, isDefault },
      });
    },
    onSuccess: () => {
      toast({
        title: isEdit ? t('ops.ref.valueSaved') : t('ops.ref.created', { code }),
        variant: 'success',
      });
      onSaved();
    },
    // <ErrorSummary> renders field errors, or the API's top-level message (conflict / forbidden /
    // stale version) as a single line — so no separate toast is needed here.
    onError: (e) => errs.fromError(e),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('ops.ref.editValue') : t('ops.ref.newValue')}</DialogTitle>
          <DialogDescription>{t('ops.ref.editorHint')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) save.mutate();
          }}
        >
          <ErrorSummary title={t('state.validation.title')} errors={errs.summary} />

          {isEdit ? (
            <div className="text-sm">
              <span className="text-muted-foreground">{t('ops.ref.stableCode')}: </span>
              <span className="bidi-isolate font-mono">{value!.code}</span>
            </div>
          ) : (
            <Field
              label={t('ops.ref.stableCode')}
              htmlFor="rd-code"
              required
              hint={t('ops.ref.codeHint')}
              error={
                errs.fieldError('code') ??
                (code && !codeValid
                  ? t('ops.ref.codeInvalid')
                  : dupCode
                    ? t('ops.ref.codeDup')
                    : null)
              }
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder={t('ops.ref.codePlaceholder')}
                  autoFocus
                />
              )}
            </Field>
          )}

          {locales.map((l) => (
            <Field
              key={l.code}
              label={t('ops.ref.labelForLocale', { locale: l.englishName })}
              htmlFor={`rd-label-${l.code}`}
              required={l.code === 'en'}
              error={l.code === 'en' ? errs.fieldError('label') : null}
              hint={l.code === 'en' ? undefined : t('ops.ref.localeFallbackHint')}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  dir="auto"
                  value={labels[l.code] ?? ''}
                  onChange={(e) => setLabels((s) => ({ ...s, [l.code]: e.target.value }))}
                  data-testid={`label-${l.code}`}
                />
              )}
            </Field>
          ))}

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              data-testid="value-default"
            />
            <span>
              <span className="font-medium">{t('ops.ref.setDefault')}</span>
              <span className="block text-xs text-muted-foreground">
                {t('ops.ref.setDefaultHint')}
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
              {t('ops.st.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!canSubmit}>
              {t('ops.st.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
