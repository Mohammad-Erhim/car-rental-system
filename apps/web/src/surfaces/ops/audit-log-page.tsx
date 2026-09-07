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

import { useAuditLog } from '../../lib/admin-hooks.js';

/**
 * SCREEN-OPS-038 — Audit & activity. An append-only view of consequential actions. Sensitive
 * values in the before/after snapshots are masked at write time (SRS-SEC-011); this screen never
 * un-masks them. Filter by action or target type; the API returns the newest 200 matches and the
 * table renders the most recent 120 of them (narrow the filter to reach older ones).
 */
export function AuditLogPage() {
  const { t } = useI18n();
  const [draft, setDraft] = useState({ action: '', targetType: '' });
  const [filter, setFilter] = useState<{ action?: string; targetType?: string }>({});
  const rows = useAuditLog(filter);
  const [expanded, setExpanded] = useState<string | null>(null);

  // the API returns up to 200; render a bounded slice so a busy log stays responsive
  const RENDER_CAP = 120;
  const visibleRows = rows.data?.slice(0, RENDER_CAP) ?? [];
  const hiddenCount = (rows.data?.length ?? 0) - visibleRows.length;

  function apply(e: React.FormEvent) {
    e.preventDefault();
    setFilter({
      action: draft.action.trim() || undefined,
      targetType: draft.targetType.trim() || undefined,
    });
  }

  type Event = NonNullable<typeof rows.data>[number];
  const columns: Array<DataTableColumn<Event>> = [
    {
      key: 'when',
      header: t('ops.audit.hWhen'),
      cell: (r) => new Date(r.occurredAt).toLocaleString(),
      className: 'pe-3 text-xs text-muted-foreground',
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
            <Field
              label={t('ops.audit.filterAction')}
              htmlFor="aud-action"
              hint={t('ops.audit.actionHint')}
            >
              {({ id }) => (
                <Input
                  id={id}
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
            <Button type="submit" data-testid="audit-apply">
              {t('ops.audit.apply')}
            </Button>
            {(filter.action || filter.targetType) && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraft({ action: '', targetType: '' });
                  setFilter({});
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
