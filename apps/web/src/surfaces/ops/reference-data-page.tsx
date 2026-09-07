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
  ErrorSummary,
  Field,
  Input,
  PageHeader,
} from '@carrental/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Lock } from 'lucide-react';
import { useState } from 'react';

import { useLookupTypes, useLookupValues } from '../../lib/api-hooks.js';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { useFormErrors } from '../../lib/use-form-errors.js';

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
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const type = values.data?.type;
  const readOnly = type?.editability === 'read_only';

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
    mutationFn: (input: { id: string; active: boolean }) =>
      apiFetch(
        `/reference-data/types/${typeCode}/values/${input.id}/${input.active ? 'restore' : 'deactivate'}`,
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

  const TH = ['code', 'labelEn', 'state'] as const;

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
        {values.isLoading ? (
          <AppStateView kind="loading" title={t('ops.st.loading')} inline />
        ) : values.isError ? (
          <AppStateView
            kind="failure"
            inline
            title={t('ops.ref.loadValuesFail')}
            primaryAction={{ label: t('ops.st.retry'), onClick: () => values.refetch() }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="text-start text-xs uppercase text-muted-foreground">
                <tr>
                  {TH.map((k) => (
                    <th key={k} className="py-1 text-start font-medium">
                      {k === 'labelEn' ? t('ops.ref.labelEn') : t(`ops.tbl.${k}`)}
                    </th>
                  ))}
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody data-testid="lookup-value-rows">
                {values.data!.values.map((v) => (
                  <tr key={v.id} className="border-t" data-code={v.code} data-active={v.isActive}>
                    <td className="py-2 pe-2 align-top">
                      <span className="bidi-isolate font-mono text-xs">{v.code}</span>
                    </td>
                    <td className="py-2 pe-2 align-top">
                      {readOnly || v.systemManaged ? (
                        v.label
                      ) : (
                        <InlineLabel
                          value={v.label}
                          onSave={(label) => editLabel.mutate({ id: v.id, label })}
                        />
                      )}
                    </td>
                    <td className="py-2 pe-2 align-top">
                      {v.isActive ? (
                        <Badge variant="success">{t('ops.ref.active')}</Badge>
                      ) : (
                        <Badge variant="neutral">{t('ops.ref.inactive')}</Badge>
                      )}
                    </td>
                    <td className="py-2 text-end align-top">
                      {canManage && !readOnly && !v.systemManaged ? (
                        v.isActive ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeactivateId(v.id)}
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
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
        open={!!deactivateId}
        onOpenChange={(v) => !v && setDeactivateId(null)}
        title={t('ops.ref.deactivateQ')}
        description={t('ops.ref.deactivateBody')}
        confirmLabel={t('ops.ref.deactivate')}
        destructive
        onConfirm={() => {
          if (deactivateId) setActive.mutate({ id: deactivateId, active: false });
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
