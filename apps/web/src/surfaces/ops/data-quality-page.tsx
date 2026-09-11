import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  PageHeader,
  Toolbar,
  type DataTableColumn,
} from '@carrental/ui';
import { Link } from 'react-router-dom';

import { useDataQuality, type DataQualityCheck } from '../../lib/admin-hooks.js';

/** Checks whose `sample` keys are a record reference this app already has a detail page for —
 *  the drill-down pattern used across the audit/consent-log/staff-roles pages, so a flagged
 *  reference is one click away from the actual record instead of a plain string to copy by hand.
 *  Not every check's key format has a matching route yet (e.g. a plate or a `kind:key` pair) —
 *  those stay plain text rather than link to a page that can't filter by them. */
const SAMPLE_LINK: Partial<Record<string, (key: string) => string>> = {
  reservation_orphan_account: (key) => `/ops/work/${key}`,
  rental_active_without_unit: (key) => `/ops/rentals/${key}`,
};

/**
 * SCREEN-OPS-039 — Data quality. A read-only sweep of referential-integrity / drift checks.
 * A non-zero count is something ops should work; the panel never mutates anything.
 */
export function DataQualityPage() {
  const { t, fmt } = useI18n();
  const report = useDataQuality();

  const sevVariant = (s: string) =>
    s === 'high' ? 'destructive' : s === 'medium' ? 'warning' : 'neutral';

  const columns: Array<DataTableColumn<DataQualityCheck>> = [
    {
      key: 'check',
      header: t('ops.dq.check'),
      cell: (c) => (
        <span className={c.ok ? '' : 'font-medium'}>
          {c.title}
          <span className="ms-2 font-mono text-xs text-muted-foreground">{c.id}</span>
        </span>
      ),
    },
    {
      key: 'severity',
      header: t('ops.dq.severity'),
      cell: (c) => <Badge variant={sevVariant(c.severity)}>{c.severity}</Badge>,
    },
    {
      key: 'count',
      header: t('ops.dq.count'),
      cell: (c) =>
        c.error ? (
          <Badge variant="warning" title={c.error}>
            {t('ops.dq.checkFailed')}
          </Badge>
        ) : c.ok ? (
          <Badge variant="success">{t('ops.dq.clear')}</Badge>
        ) : (
          <span className="font-semibold tabular-nums text-destructive">{c.count}</span>
        ),
    },
    {
      key: 'sample',
      header: t('ops.dq.sample'),
      cell: (c) => {
        if (c.error) return <span className="text-xs text-muted-foreground">{c.error}</span>;
        if (!c.sample.length) return '—';
        const toHref = SAMPLE_LINK[c.id];
        return (
          <span className="bidi-isolate flex flex-wrap gap-x-1 font-mono text-xs text-muted-foreground">
            {c.sample.map((key, i) => (
              <span key={key}>
                {toHref ? (
                  <Link
                    to={toHref(key)}
                    className="underline decoration-dotted hover:text-foreground"
                  >
                    {key}
                  </Link>
                ) : (
                  key
                )}
                {i < c.sample.length - 1 ? ',' : ''}
              </span>
            ))}
          </span>
        );
      },
    },
  ];

  const issues = (report.data?.checks ?? []).filter((c) => !c.ok);

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.dq.title')} description={t('ops.dq.subtitle')} />

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">{t('ops.dq.card')}</CardTitle>
          <Toolbar aria-label={t('ops.dq.card')}>
            {report.data ? (
              <span className="text-sm" data-testid="dq-summary">
                {report.data.ok ? (
                  <Badge variant="success">{t('ops.dq.allClear')}</Badge>
                ) : (
                  <Badge variant="warning">{t('ops.dq.issues', { n: issues.length })}</Badge>
                )}
                <span className="ms-2 text-xs text-muted-foreground">
                  {t('ops.dq.checkedAt', {
                    at: fmt.dateTime(report.data.checkedAt),
                  })}
                </span>
              </span>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              loading={report.isFetching}
              onClick={() => report.refetch()}
              data-testid="dq-refresh"
            >
              {t('ops.dq.refresh')}
            </Button>
          </Toolbar>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={report.data?.checks}
            rowKey={(c) => c.id}
            isLoading={report.isLoading}
            isError={report.isError}
            onRetry={() => report.refetch()}
            rowProps={(c) => ({ 'data-check': c.id, 'data-ok': String(c.ok) })}
            testid="dq-table"
            bodyTestid="dq-rows"
            minWidth="44rem"
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.dq.loadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.dq.empty'),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
