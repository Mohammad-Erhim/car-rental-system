import { useAuth, useFormErrors } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  Alert,
  AlertDescription,
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
  Textarea,
  useToast,
  type DataTableColumn,
} from '@carrental/ui';
import { useMemo, useRef, useState } from 'react';

import {
  useConfigPreview,
  useConfigVersionTransition,
  useConfigVersions,
  useDeleteConfigVersion,
  useDraftConfigVersion,
  type ConfigState,
  type ConfigVersion,
  type PolicyPreview,
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
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');

  const [kind, setKind] = useState(KINDS[0]!.kind);
  const kindDef = KINDS.find((k) => k.kind === kind) ?? KINDS[0]!;
  const [key, setKey] = useState(kindDef.keys[0]!.key);
  const keyDef = kindDef.keys.find((k) => k.key === key) ?? kindDef.keys[0]!;

  const fieldLabel = (name: string) => t(`ops.cfg.field.${name}`);
  const fieldHint = (name: string) => t(`ops.cfg.field.${name}Hint`);
  const shortLabel = (name: string) => t(`ops.cfg.short.${name}`);

  /** A human reading of a raw stored value — bps as a percentage, hours as hours, etc. */
  const fmtValue = (name: string, v: number): string => {
    if (!Number.isFinite(v)) return String(v);
    if (name === 'lateFeeBps') return fmt.percent(v / 10000, { maximumFractionDigits: 2 });
    if (name === 'freeCancelHours') return t('ops.cfg.fmt.hours', { n: fmt.number(v) });
    if (name === 'minorPerPct') return t('ops.cfg.fmt.minorPerPct', { n: fmt.number(v) });
    return fmt.number(v);
  };

  const versions = useConfigVersions(kind, key);
  const draft = useDraftConfigVersion();
  const preview = useConfigPreview();
  const transition = useConfigVersionTransition();
  const removeVersion = useDeleteConfigVersion();
  const errs = useFormErrors(
    Object.fromEntries(keyDef.fields.map((f) => [f.name, fieldLabel(f.name)])) as Record<
      string,
      string
    >,
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectReasonError, setRejectReasonError] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const formCard = useRef<HTMLDivElement>(null);

  const currentPublished = useMemo(
    () => versions.data?.find((v) => v.state === 'published') ?? null,
    [versions.data],
  );
  const approvingRow = useMemo(
    () => versions.data?.find((v) => v.id === approving) ?? null,
    [versions.data, approving],
  );

  /** Fields that carry a real value change against the currently published revision. */
  const diffRows = approvingRow
    ? Object.entries(approvingRow.payload)
        .map(([k, to]) => ({
          k,
          label: shortLabel(k),
          from: currentPublished ? (currentPublished.payload[k] as number | undefined) : undefined,
          to: to as number,
        }))
        .filter((d) => d.from !== d.to)
    : [];

  // sane upper bounds — mirror of the API's POLICY_FIELD_BOUNDS; a value past these is a
  // fat-finger that would mis-price a customer.
  const FIELD_MAX: Record<string, number> = {
    freeCancelHours: 8760,
    lateFeeBps: 10000,
    minorPerPct: 100000,
  };

  /** Client-side check: every field must be an explicit, non-negative number (blank ≠ 0). */
  function validate(): Record<string, number> | null {
    const local: Array<{ path: string; code: string }> = [];
    const payload: Record<string, number> = {};
    for (const f of keyDef.fields) {
      const raw = (values[f.name] ?? '').trim();
      if (raw === '') {
        local.push({ path: f.name, code: 'required' });
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        local.push({ path: f.name, code: 'must_be_non_negative_number' });
        continue;
      }
      if (FIELD_MAX[f.name] != null && n > FIELD_MAX[f.name]!) {
        local.push({ path: f.name, code: 'out_of_range' });
        continue;
      }
      payload[f.name] = n;
    }
    if (local.length) {
      errs.setLocal(local);
      return null;
    }
    return payload;
  }

  const money = (m: number, c: string) => fmt.money({ amountMinor: m, currency: c });

  /** Localised worked-example lines from the API's structured policy projection. */
  function policyPreviewLines(pp: PolicyPreview): string[] {
    const out: string[] = [];
    const showCancel = pp.key === 'cancellation' || pp.key == null;
    const showFuel = pp.key === 'fuel_rate' || pp.key == null;
    if (showCancel) {
      out.push(
        t('ops.cfg.pv.cancelFee', {
          hours: fmt.number(pp.freeCancelHours),
          pct: fmt.percent(pp.lateFeeBps / 10000, { maximumFractionDigits: 2 }),
          fee: money(pp.lateFeeMinor, pp.currency),
          sample: money(pp.sampleTotalMinor, pp.currency),
        }),
      );
      out.push(t('ops.cfg.pv.cancelFree', { hours: fmt.number(pp.freeCancelHours) }));
    }
    if (showFuel) {
      out.push(
        t('ops.cfg.pv.fuel', {
          pct: fmt.number(pp.sampleFuelDeficitPct),
          charge: money(pp.fuelChargeMinor, pp.currency),
        }),
      );
    }
    return out;
  }

  async function doPreview() {
    setActionError(null);
    errs.clear();
    const payload = validate();
    if (!payload) return;
    try {
      await preview.mutateAsync({ kind, key, payload });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('ops.cfg.previewFail'));
    }
  }

  async function submitDraft(e: React.FormEvent) {
    e.preventDefault();
    errs.clear();
    setActionError(null);
    const payload = validate();
    if (!payload) return;
    try {
      const created = await draft.mutateAsync({
        kind,
        key,
        payload,
        note: note.trim() || undefined,
      });
      toast({ title: t('ops.cfg.drafted', { n: created.revision }), variant: 'success' });
      setValues({});
      setNote('');
      preview.reset();
    } catch (err) {
      errs.fromError(err);
      if (err instanceof ApiError && !err.fieldErrors.length) setActionError(err.message);
    }
  }

  async function act(id: string, action: 'submit' | 'approve' | 'reject', reason?: string) {
    setActionError(null);
    if (action === 'reject' && !reason?.trim()) {
      setRejecting(id);
      return;
    }
    const rev = versions.data?.find((v) => v.id === id)?.revision;
    try {
      await transition.mutateAsync({ id, action, note: reason?.trim() });
      setRejecting(null);
      setRejectReason('');
      setApproving(null);
      const key3 =
        action === 'submit'
          ? 'ops.cfg.submitted'
          : action === 'approve'
            ? 'ops.cfg.approved'
            : 'ops.cfg.rejected';
      toast({ title: t(key3, { n: rev ?? '' }), variant: 'success' });
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.problem.params?.reason === 'author_cannot_approve'
            ? t('ops.cfg.authorCannotApprove')
            : err.message
          : t('ops.cfg.actionFail'),
      );
      setRejecting(null);
      setApproving(null);
    }
  }

  async function doDelete(id: string) {
    const rev = versions.data?.find((v) => v.id === id)?.revision;
    try {
      await removeVersion.mutateAsync(id);
      setDeleting(null);
      toast({ title: t('ops.cfg.deleted', { n: rev ?? '' }), variant: 'success' });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('ops.cfg.actionFail'));
      setDeleting(null);
    }
  }

  /** Prefill the draft form from an earlier revision — the way forward from a rejected one. */
  function doRevise(v: ConfigVersion) {
    errs.clear();
    preview.reset();
    setActionError(null);
    setValues(
      Object.fromEntries(
        keyDef.fields.map((f) => [
          f.name,
          String((v.payload as Record<string, number>)[f.name] ?? ''),
        ]),
      ),
    );
    setNote('');
    requestAnimationFrame(() =>
      formCard.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  type Version = NonNullable<typeof versions.data>[number];
  const payloadCell = (v: ConfigVersion) =>
    Object.entries(v.payload)
      .map(([k, val]) =>
        keyDef.fields.some((f) => f.name === k)
          ? `${shortLabel(k)} ${fmtValue(k, val as number)}`
          : `${k}=${val}`,
      )
      .join(' · ');

  const columns: Array<DataTableColumn<Version>> = [
    { key: 'rev', header: t('ops.tbl.rev'), cell: (v) => v.revision, className: 'font-mono' },
    {
      key: 'state',
      header: t('ops.tbl.state'),
      cell: (v) => <Badge variant={STATE_VARIANT[v.state]}>{t(`ops.cfg.state.${v.state}`)}</Badge>,
    },
    {
      key: 'payload',
      header: t('ops.tbl.payload'),
      cell: (v) => payloadCell(v),
      className: 'text-xs',
    },
    {
      key: 'note',
      header: t('ops.tbl.note'),
      cell: (v) => (v.note ? <span className="whitespace-pre-line">{v.note}</span> : '—'),
      className: 'text-muted-foreground',
    },
    {
      key: 'effective',
      header: t('ops.tbl.effective'),
      cell: (v) => (v.effectiveFrom ? fmt.dateTime(v.effectiveFrom) : '—'),
      className: 'text-xs text-muted-foreground',
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (v) => (
        <div className="flex justify-end gap-2">
          {v.state === 'draft' ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => act(v.id, 'submit')}
                loading={transition.isPending}
                disabled={!canPublish}
                data-testid={`submit-${v.revision}`}
              >
                {t('ops.cfg.submit')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleting(v.id)}
                disabled={!canPublish}
                data-testid={`delete-${v.revision}`}
              >
                {t('ops.cfg.delete')}
              </Button>
            </>
          ) : null}
          {(v.state === 'rejected' || v.state === 'superseded') && v.key === key ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => doRevise(v)}
              data-testid={`revise-${v.revision}`}
            >
              {t('ops.cfg.revise')}
            </Button>
          ) : null}
          {v.state === 'in_review' && canPublish ? (
            <>
              <Button
                size="sm"
                onClick={() => setApproving(v.id)}
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
                errs.clear();
                preview.reset();
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
                errs.clear();
                preview.reset();
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
        <CardContent className="space-y-3">
          <div
            className="rounded-md border bg-muted/40 p-3 text-sm"
            data-testid="config-current-published"
          >
            <p className="mb-1 font-medium">{t('ops.cfg.currentValues')}</p>
            {versions.isLoading ? (
              <p className="text-muted-foreground">{t('ops.st.loading')}</p>
            ) : currentPublished ? (
              <dl className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                {keyDef.fields.map((f) => (
                  <div key={f.name} className="flex gap-2">
                    <dt>{shortLabel(f.name)}:</dt>
                    <dd className="font-medium text-foreground">
                      {fmtValue(f.name, currentPublished.payload[f.name] as number)}
                    </dd>
                  </div>
                ))}
                <div className="text-xs">
                  {t('ops.cfg.rev', { n: currentPublished.revision })}
                  {currentPublished.effectiveFrom
                    ? ` · ${fmt.dateTime(currentPublished.effectiveFrom)}`
                    : ''}
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground">{t('ops.cfg.noPublished')}</p>
            )}
          </div>

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
            <p className="text-sm text-destructive" data-testid="config-action-error">
              {actionError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card ref={formCard}>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.cfg.newDraft')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorSummary title={t('ops.cfg.checkFields')} errors={errs.summary} />
          <form onSubmit={submitDraft} className="space-y-4" noValidate>
            {/* a config.read-only viewer reaches this screen too (route allows config.read OR
                config.publish) — disable every write control instead of letting them fill out a
                draft they can't save. */}
            <fieldset disabled={!canPublish} className="contents">
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
                  <Textarea
                    id={id}
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                )}
              </Field>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" loading={draft.isPending} data-testid="config-draft">
                  {t('ops.cfg.saveDraft')}
                </Button>
              </div>
            </fieldset>

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
            </div>

            {preview.data ? (
              <div
                className="rounded-md border bg-muted/40 p-3 text-sm"
                data-testid="config-preview-output"
              >
                <p className="mb-1 font-medium">{t('ops.cfg.previewOut')}</p>
                <ul className="list-disc space-y-1 ps-5 text-muted-foreground">
                  {(preview.data.policy
                    ? policyPreviewLines(preview.data.policy)
                    : preview.data.examples
                  ).map((ex, i) => (
                    <li key={i}>{ex}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!approving}
        onOpenChange={(v) => !v && setApproving(null)}
        title={t('ops.cfg.approveTitle')}
        description={
          <div className="space-y-3">
            <p>{t('ops.cfg.approveBody')}</p>
            {approvingRow ? (
              diffRows.length ? (
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  <p className="mb-1 font-medium">{t('ops.cfg.diffTitle')}</p>
                  <ul className="space-y-1" data-testid="config-approve-diff">
                    {diffRows.map((d) => (
                      <li key={d.k} className="flex flex-wrap gap-2">
                        <span className="text-muted-foreground">{d.label}:</span>
                        <span>
                          {d.from === undefined
                            ? t('ops.cfg.builtInDefault')
                            : fmtValue(d.k, d.from)}
                        </span>
                        <span aria-hidden>→</span>
                        <span className="font-medium">{fmtValue(d.k, d.to)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <Alert variant="warning">
                  <AlertDescription>{t('ops.cfg.diffNone')}</AlertDescription>
                </Alert>
              )
            ) : null}
            <p className="text-xs text-muted-foreground">{t('ops.cfg.appliesToNew')}</p>
          </div>
        }
        confirmLabel={t('ops.cfg.approve')}
        onConfirm={() => act(approving!, 'approve')}
      />

      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(v) => {
          if (!v) {
            setRejecting(null);
            setRejectReason('');
            setRejectReasonError(false);
          }
        }}
        destructive
        title={t('ops.cfg.rejectTitle')}
        description={
          <div className="space-y-3">
            <p>{t('ops.cfg.rejectBody')}</p>
            <Field
              label={t('ops.cfg.rejectReason')}
              htmlFor="cfg-reject-reason"
              required
              error={rejectReasonError ? t('ops.cfg.rejectReasonRequired') : undefined}
            >
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value);
                    if (e.target.value.trim()) setRejectReasonError(false);
                  }}
                  data-testid="config-reject-reason"
                />
              )}
            </Field>
          </div>
        }
        confirmLabel={t('ops.cfg.reject')}
        onConfirm={() => {
          if (!rejectReason.trim()) {
            setRejectReasonError(true);
            throw new Error('reason required'); // keeps the ConfirmDialog open
          }
          setRejectReasonError(false);
          const id = rejecting!;
          return act(id, 'reject', rejectReason);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        destructive
        title={t('ops.cfg.deleteTitle')}
        description={t('ops.cfg.deleteBody')}
        confirmLabel={t('ops.cfg.delete')}
        onConfirm={() => doDelete(deleting!)}
      />
    </div>
  );
}
