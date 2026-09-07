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
  Textarea,
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
import { useAuth } from '../../lib/auth.js';
import { useFormErrors } from '../../lib/use-form-errors.js';

/**
 * SCREEN-OPS-033/034 — Configuration versioning. A change to a policy is drafted, previewed,
 * submitted for review, then published by a *different* person (FR-ADM-006 separation of
 * duties). Publishing supersedes the prior published revision and takes effect with no
 * redeploy; a published revision is never edited in place (FR-ADM-005).
 */

interface PolicyKey {
  key: string;
  label: string;
  fields: Array<{ name: string; label: string; hint: string }>;
}

const KINDS: Array<{ kind: string; label: string; keys: PolicyKey[] }> = [
  {
    kind: 'policy',
    label: 'Policy',
    keys: [
      {
        key: 'cancellation',
        label: 'Cancellation',
        fields: [
          {
            name: 'freeCancelHours',
            label: 'Free-cancel window (hours)',
            hint: 'cancel at least this long before pickup for no fee',
          },
          {
            name: 'lateFeeBps',
            label: 'Late-cancel fee (basis points)',
            hint: '2000 = 20% of the reservation total',
          },
        ],
      },
      {
        key: 'fuel_rate',
        label: 'Fuel recharge rate',
        fields: [
          {
            name: 'minorPerPct',
            label: 'Charge per 1% missing fuel (minor units)',
            hint: '150 = $1.50 per percentage point below pickup level',
          },
        ],
      },
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
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');

  const [kind, setKind] = useState(KINDS[0]!.kind);
  const kindDef = KINDS.find((k) => k.kind === kind) ?? KINDS[0]!;
  const [key, setKey] = useState(kindDef.keys[0]!.key);
  const keyDef = kindDef.keys.find((k) => k.key === key) ?? kindDef.keys[0]!;

  const versions = useConfigVersions(kind, key);
  const draft = useDraftConfigVersion();
  const preview = useConfigPreview();
  const transition = useConfigVersionTransition();
  const errs = useFormErrors(
    Object.fromEntries(keyDef.fields.map((f) => [f.name, f.label])) as Record<string, string>,
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
      setActionError(err instanceof ApiError ? err.message : 'Preview failed.');
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
      reason = window.prompt('Reason for rejecting this version?')?.trim() ?? '';
      if (!reason) return;
    }
    try {
      await transition.mutateAsync({ id, action, note: reason });
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.problem.params?.reason === 'author_cannot_approve'
            ? 'A different reviewer must approve this change (separation of duties).'
            : err.message
          : 'Action failed.',
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Configuration versioning</h1>
        <p className="text-sm text-muted-foreground">
          Draft a change, preview its effect, then submit it for review. Publishing is done by a
          different person and takes effect immediately — the previous revision is kept, never
          overwritten.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Field label="Area" htmlFor="cfg-kind">
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
                  {k.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Setting" htmlFor="cfg-key">
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
                  {k.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Revision history — {kindDef.label} / {keyDef.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {versions.isLoading ? (
            <AppStateView kind="loading" inline title="Loading…" />
          ) : versions.isError ? (
            <AppStateView
              kind="failure"
              inline
              title="Couldn't load versions"
              primaryAction={{ label: 'Retry', onClick: () => versions.refetch() }}
            />
          ) : !versions.data?.length ? (
            <AppStateView
              kind="empty"
              inline
              title="No revisions yet — draft the first one below"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm" data-testid="config-version-table">
                <thead className="text-start text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-1 text-start font-medium">Rev</th>
                    <th className="py-1 text-start font-medium">State</th>
                    <th className="py-1 text-start font-medium">Payload</th>
                    <th className="py-1 text-start font-medium">Note</th>
                    <th className="py-1 text-start font-medium">Effective</th>
                    <th className="py-1"></th>
                  </tr>
                </thead>
                <tbody data-testid="config-version-rows">
                  {versions.data.map((v) => (
                    <tr
                      key={v.id}
                      className="border-t align-top"
                      data-state={v.state}
                      data-rev={v.revision}
                      data-testid={`config-row-${v.revision}`}
                    >
                      <td className="py-2 pe-2 font-mono">{v.revision}</td>
                      <td className="py-2 pe-2">
                        <Badge variant={STATE_VARIANT[v.state]}>{v.state}</Badge>
                      </td>
                      <td className="py-2 pe-2 font-mono text-xs">
                        {Object.entries(v.payload)
                          .map(([k, val]) => `${k}=${val}`)
                          .join(', ')}
                      </td>
                      <td className="py-2 pe-2 text-muted-foreground">{v.note ?? '—'}</td>
                      <td className="py-2 pe-2 text-xs text-muted-foreground">
                        {v.effectiveFrom ? new Date(v.effectiveFrom).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 text-end">
                        <div className="flex justify-end gap-2">
                          {v.state === 'draft' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => act(v.id, 'submit')}
                              data-testid={`submit-${v.revision}`}
                            >
                              Submit
                            </Button>
                          ) : null}
                          {v.state === 'in_review' && canPublish ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => act(v.id, 'approve')}
                                data-testid={`approve-${v.revision}`}
                              >
                                Approve &amp; publish
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => act(v.id, 'reject')}
                                data-testid={`reject-${v.revision}`}
                              >
                                Reject
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {actionError ? (
            <p className="mt-3 text-sm text-destructive" data-testid="config-action-error">
              {actionError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New revision (draft)</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorSummary title="Check the highlighted fields" errors={errs.summary} />
          <form onSubmit={submitDraft} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              {keyDef.fields.map((f) => (
                <Field
                  key={f.name}
                  label={f.label}
                  htmlFor={`cfg-${f.name}`}
                  required
                  hint={f.hint}
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
            <Field label="Change note" htmlFor="cfg-note" hint="why this change is being made">
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
                Preview effect
              </Button>
              <Button type="submit" loading={draft.isPending} data-testid="config-draft">
                Save draft
              </Button>
            </div>

            {preview.data ? (
              <div
                className="rounded-md border bg-muted/40 p-3 text-sm"
                data-testid="config-preview-output"
              >
                <p className="mb-1 font-medium">Preview</p>
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
