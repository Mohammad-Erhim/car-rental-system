import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  Field,
  Input,
  PageHeader,
  type DataTableColumn,
} from '@carrental/ui';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAuditLog } from '../../lib/admin-hooks.js';

/** Common actions, for the filter's autocomplete — the field still accepts anything. */
const COMMON_ACTIONS = [
  'ops.search',
  'customer.searched',
  'reservation.cancelled',
  'reservation.modified',
  'reservation.no_show',
  'payment.reconciled',
  'payment.refund',
  'fleet.block.opened',
  'fleet.unit.transferred',
  'recovery_case.retried',
  'config.published',
  'iam.staff.invited',
];

/**
 * SCREEN-OPS-038 — Audit & activity. An append-only view of consequential actions. Sensitive
 * values in the before/after snapshots are masked at write time (SRS-SEC-011); this screen never
 * un-masks them. Filter by action or target type; the API returns the newest 200 matches and the
 * table renders the most recent 120 of them (narrow the filter to reach older ones).
 */
export function AuditLogPage() {
  const { t, fmt } = useI18n();
  const [params, setParams] = useSearchParams();
  const filter = {
    action: params.get('action') ?? undefined,
    targetType: params.get('targetType') ?? undefined,
    from: params.get('from') ? `${params.get('from')}T00:00:00.000Z` : undefined,
    to: params.get('to') ? `${params.get('to')}T23:59:59.999Z` : undefined,
  };
  const [draft, setDraft] = useState({
    action: params.get('action') ?? '',
    targetType: params.get('targetType') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  });
  const rows = useAuditLog(filter);
  const [expanded, setExpanded] = useState<string | null>(null);

  const hasFilter = !!(filter.action || filter.targetType || filter.from || filter.to);

  // the API returns up to 200; render a bounded slice so a busy log stays responsive
  const RENDER_CAP = 120;
  const visibleRows = rows.data?.slice(0, RENDER_CAP) ?? [];
  const hiddenCount = (rows.data?.length ?? 0) - visibleRows.length;

  function apply(e: React.FormEvent) {
    e.preventDefault();
    setParams(
      (p) => {
        for (const [k, v] of Object.entries(draft)) {
          if (v.trim()) p.set(k, v.trim());
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );
  }

  type Event = NonNullable<typeof rows.data>[number];
  const columns: Array<DataTableColumn<Event>> = [
    {
      key: 'when',
      header: t('ops.audit.hWhen'),
      cell: (r) => fmt.dateTime(r.occurredAt),
      className: 'whitespace-nowrap pe-3 text-xs text-muted-foreground',
    },
    { key: 'actor', header: t('ops.audit.hActor'), cell: (r) => r.actor, className: 'pe-3' },
    {
      key: 'action',
      header: t('ops.audit.hAction'),
      cell: (r) => r.action,
      className: 'pe-3 font-mono text-xs',
    },
    {
      key: 'target',
      header: t('ops.audit.hTarget'),
      cell: (r) => (
        <>
          {r.targetType ?? '—'}
          {r.targetId ? (
            <span className="text-muted-foreground"> · {r.targetId.slice(0, 8)}</span>
          ) : null}
        </>
      ),
      className: 'pe-3 text-xs',
    },
    {
      key: 'outcome',
      header: t('ops.audit.hOutcome'),
      cell: (r) => (
        <Badge
          variant={
            r.outcome === 'accepted'
              ? 'success'
              : r.outcome === 'rejected'
                ? 'warning'
                : 'destructive'
          }
        >
          {r.outcome}
        </Badge>
      ),
      className: 'pe-3',
    },
    {
      key: 'actions',
      header: '',
      className: 'text-end',
      cell: (r) =>
        r.before || r.after ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
          >
            {expanded === r.id ? t('ops.audit.hide') : t('ops.audit.diff')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.audit.title')} description={t('ops.audit.subtitle')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.audit.filter')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={apply} className="flex flex-wrap items-end gap-3" noValidate>
            <datalist id="audit-actions">
              {COMMON_ACTIONS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <Field
              label={t('ops.audit.filterAction')}
              htmlFor="aud-action"
              hint={t('ops.audit.actionHint')}
            >
              {({ id }) => (
                <Input
                  id={id}
                  list="audit-actions"
                  data-testid="audit-action"
                  value={draft.action}
                  onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
                />
              )}
            </Field>
            <Field
              label={t('ops.audit.filterTarget')}
              htmlFor="aud-target"
              hint={t('ops.audit.targetHint')}
            >
              {({ id }) => (
                <Input
                  id={id}
                  data-testid="audit-target"
                  value={draft.targetType}
                  onChange={(e) => setDraft((d) => ({ ...d, targetType: e.target.value }))}
                />
              )}
            </Field>
            <Field label={t('ops.search.from')} htmlFor="aud-from">
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={draft.from}
                  max={draft.to || undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                />
              )}
            </Field>
            <Field label={t('ops.search.to')} htmlFor="aud-to">
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={draft.to}
                  min={draft.from || undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                />
              )}
            </Field>
            <Button type="submit" data-testid="audit-apply">
              {t('ops.audit.apply')}
            </Button>
            {hasFilter && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraft({ action: '', targetType: '', from: '', to: '' });
                  setParams({}, { replace: true });
                }}
              >
                {t('ops.st.clear')}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.audit.events')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={visibleRows}
            rowKey={(r) => r.id}
            isLoading={rows.isLoading}
            isError={rows.isError}
            onRetry={() => rows.refetch()}
            rowProps={(r) => ({ 'data-action': r.action })}
            rowClassName="align-top"
            testid="audit-table"
            bodyTestid="audit-rows"
            minWidth="44rem"
            renderSubRow={(r) =>
              expanded === r.id ? (
                <div className="grid gap-3 bg-muted/30 p-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                      {t('ops.audit.before')}
                    </p>
                    <pre className="overflow-auto rounded border bg-background p-2 text-xs">
                      {JSON.stringify(r.before ?? {}, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                      {t('ops.audit.after')}
                    </p>
                    <pre className="overflow-auto rounded border bg-background p-2 text-xs">
                      {JSON.stringify(r.after ?? {}, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : null
            }
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.audit.loadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.audit.empty'),
            }}
          />
          {hiddenCount > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {t('ops.audit.capped', { n: RENDER_CAP, more: hiddenCount })}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
