import { useAuth, useFormErrors } from '@carrental/client/react';
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
  Textarea,
  type DataTableColumn,
} from '@carrental/ui';
import { useMemo, useState } from 'react';

import {
  useConfigPreview,
  useConfigVersionTransition,
  useConfigVersions,
  useDraftConfigVersion,
  type ConfigState,
} from '../../lib/admin-hooks.js';
import { ApiError } from '../../lib/api.js';

/**
 * SCREEN-OPS-033/034 — Configuration versioning. A change to a policy is drafted, previewed,
 * submitted for review, then published by a *different* person (FR-ADM-006 separation of
 * duties). Publishing supersedes the prior published revision and takes effect with no
 * redeploy; a published revision is never edited in place (FR-ADM-005).
 *
 * Display strings for areas / settings / fields resolve through i18n at render (`ops.cfg.kind.*`,
 * `ops.cfg.key.*`, `ops.cfg.field.*` + `…Hint`); the structure below is identifiers only.
 */

interface PolicyKey {
  key: string;
  fields: Array<{ name: string }>;
}

const KINDS: Array<{ kind: string; keys: PolicyKey[] }> = [
  {
    kind: 'policy',
    keys: [
      { key: 'cancellation', fields: [{ name: 'freeCancelHours' }, { name: 'lateFeeBps' }] },
      { key: 'fuel_rate', fields: [{ name: 'minorPerPct' }] },
    ],
  },
];

const STATE_VARIANT: Record<ConfigState, 'success' | 'warning' | 'neutral' | 'destructive'> = {
  draft: 'neutral',
  in_review: 'warning',
  published: 'success',
  superseded: 'neutral',
  rejected: 'destructive',
};

export function ConfigVersionsPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');

  const [kind, setKind] = useState(KINDS[0]!.kind);
  const kindDef = KINDS.find((k) => k.kind === kind) ?? KINDS[0]!;
  const [key, setKey] = useState(kindDef.keys[0]!.key);
  const keyDef = kindDef.keys.find((k) => k.key === key) ?? kindDef.keys[0]!;

  const fieldLabel = (name: string) => t(`ops.cfg.field.${name}`);
  const fieldHint = (name: string) => t(`ops.cfg.field.${name}Hint`);

  const versions = useConfigVersions(kind, key);
  const draft = useDraftConfigVersion();
  const preview = useConfigPreview();
  const transition = useConfigVersionTransition();
  const errs = useFormErrors(
    Object.fromEntries(keyDef.fields.map((f) => [f.name, fieldLabel(f.name)])) as Record<
      string,
      string
    >,
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const currentPublished = useMemo(
    () => versions.data?.find((v) => v.state === 'published') ?? null,
    [versions.data],
  );

  function payloadFromForm(): Record<string, number> {
    return Object.fromEntries(
      keyDef.fields.map((f) => [f.name, Number(values[f.name] ?? '')]),
    ) as Record<string, number>;
  }

  async function doPreview() {
    setActionError(null);
    try {
      await preview.mutateAsync({ kind, payload: payloadFromForm() });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('ops.cfg.previewFail'));
    }
  }

  async function submitDraft(e: React.FormEvent) {
    e.preventDefault();
    errs.clear();
    setActionError(null);
    try {
      await draft.mutateAsync({
        kind,
        key,
        payload: payloadFromForm(),
        note: note.trim() || undefined,
      });
      setValues({});
      setNote('');
      preview.reset();
    } catch (err) {
      errs.fromError(err);
      if (err instanceof ApiError && !err.fieldErrors.length) setActionError(err.message);
    }
  }

  async function act(id: string, action: 'submit' | 'approve' | 'reject') {
    setActionError(null);
    let reason: string | undefined;
    if (action === 'reject') {
      reason = window.prompt(t('ops.cfg.rejectPrompt'))?.trim() ?? '';
      if (!reason) return;
    }
    try {
      await transition.mutateAsync({ id, action, note: reason });
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.problem.params?.reason === 'author_cannot_approve'
            ? t('ops.cfg.authorCannotApprove')
            : err.message
          : t('ops.cfg.actionFail'),
      );
    }
  }

  type Version = NonNullable<typeof versions.data>[number];
  const columns: Array<DataTableColumn<Version>> = [
    { key: 'rev', header: t('ops.tbl.rev'), cell: (v) => v.revision, className: 'font-mono' },
    {
      key: 'state',
      header: t('ops.tbl.state'),
      cell: (v) => <Badge variant={STATE_VARIANT[v.state]}>{v.state}</Badge>,
    },
    {
      key: 'payload',
      header: t('ops.tbl.payload'),
      cell: (v) =>
        Object.entries(v.payload)
          .map(([k, val]) => `${k}=${val}`)
          .join(', '),
      className: 'font-mono text-xs',
    },
    {
      key: 'note',
      header: t('ops.tbl.note'),
      cell: (v) => v.note ?? '—',
      className: 'text-muted-foreground',
    },
    {
      key: 'effective',
      header: t('ops.tbl.effective'),
      cell: (v) => (v.effectiveFrom ? new Date(v.effectiveFrom).toLocaleString() : '—'),
      className: 'text-xs text-muted-foreground',
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (v) => (
        <div className="flex justify-end gap-2">
          {v.state === 'draft' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => act(v.id, 'submit')}
              data-testid={`submit-${v.revision}`}
            >
              {t('ops.cfg.submit')}
            </Button>
          ) : null}
          {v.state === 'in_review' && canPublish ? (
            <>
              <Button
                size="sm"
                onClick={() => act(v.id, 'approve')}
                data-testid={`approve-${v.revision}`}
              >
                {t('ops.cfg.approve')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => act(v.id, 'reject')}
                data-testid={`reject-${v.revision}`}
              >
                {t('ops.cfg.reject')}
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.cfg.title')} description={t('ops.cfg.subtitle')} />

      <div className="flex flex-wrap gap-3">
        <Field label={t('ops.cfg.area')} htmlFor="cfg-kind">
          {({ id }) => (
            <select
              id={id}
              className="flex h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                const nk = KINDS.find((k) => k.kind === e.target.value) ?? KINDS[0]!;
                setKey(nk.keys[0]!.key);
                setValues({});
              }}
            >
              {KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {t(`ops.cfg.kind.${k.kind}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('ops.cfg.setting')} htmlFor="cfg-key">
          {({ id }) => (
            <select
              id={id}
              data-testid="config-key"
              className="flex h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setValues({});
              }}
            >
              {kindDef.keys.map((k) => (
                <option key={k.key} value={k.key}>
                  {t(`ops.cfg.key.${k.key}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('ops.cfg.revHistory', {
              area: t(`ops.cfg.kind.${kind}`),
              setting: t(`ops.cfg.key.${key}`),
            })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={versions.data}
            rowKey={(v) => v.id}
            isLoading={versions.isLoading}
            isError={versions.isError}
            onRetry={() => versions.refetch()}
            rowProps={(v) => ({
              'data-state': v.state,
              'data-rev': String(v.revision),
              'data-testid': `config-row-${v.revision}`,
            })}
            rowClassName="align-top"
            testid="config-version-table"
            bodyTestid="config-version-rows"
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.cfg.loadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.cfg.empty'),
            }}
          />
          {actionError ? (
            <p className="mt-3 text-sm text-destructive" data-testid="config-action-error">
              {actionError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.cfg.newDraft')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorSummary title={t('ops.cfg.checkFields')} errors={errs.summary} />
          <form onSubmit={submitDraft} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              {keyDef.fields.map((f) => (
                <Field
                  key={f.name}
                  label={fieldLabel(f.name)}
                  htmlFor={`cfg-${f.name}`}
                  required
                  hint={fieldHint(f.name)}
                  error={errs.fieldError(f.name)}
                >
                  {({ id, invalid }) => (
                    <Input
                      id={id}
                      invalid={invalid}
                      inputMode="numeric"
                      placeholder={
                        currentPublished ? String(currentPublished.payload[f.name] ?? '') : ''
                      }
                      value={values[f.name] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      required
                    />
                  )}
                </Field>
              ))}
            </div>
            <Field label={t('ops.cfg.note')} htmlFor="cfg-note" hint={t('ops.cfg.noteHint')}>
              {({ id }) => (
                <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              )}
            </Field>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={doPreview}
                loading={preview.isPending}
                data-testid="config-preview"
              >
                {t('ops.cfg.preview')}
              </Button>
              <Button type="submit" loading={draft.isPending} data-testid="config-draft">
                {t('ops.cfg.saveDraft')}
              </Button>
            </div>

            {preview.data ? (
              <div
                className="rounded-md border bg-muted/40 p-3 text-sm"
                data-testid="config-preview-output"
              >
                <p className="mb-1 font-medium">{t('ops.cfg.previewOut')}</p>
                <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
                  {preview.data.examples.map((ex, i) => (
                    <li key={i}>{ex}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
