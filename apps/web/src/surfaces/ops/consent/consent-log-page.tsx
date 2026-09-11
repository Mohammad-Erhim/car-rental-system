import type { ConsentLogEntry } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  Input,
  PageHeader,
  useToast,
  type DataTableColumn,
} from '@carrental/ui';
import { useState } from 'react';

import {
  useConsentLog,
  useConsentLogExport,
  type ConsentLogQuery,
} from '../../../lib/consent-hooks.js';

const ACTIONS = ['', 'accept_all', 'reject_all', 'save_preferences', 'withdraw'] as const;
const selectClass = 'h-9 rounded-md border bg-background px-2 text-sm';
const PAGE = 50;

type Filters = Pick<ConsentLogQuery, 'from' | 'to' | 'action' | 'anonymousId'>;

function toCsv(rows: ConsentLogEntry[]): string {
  const head = [
    'at',
    'anonymousId',
    'action',
    'functional',
    'analytics',
    'marketing',
    'policyVersion',
    'staleVersion',
    'locale',
    'page',
    'ipPrefix',
  ];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.at,
      r.anonymousId,
      r.action,
      r.choices.functional,
      r.choices.analytics,
      r.choices.marketing,
      r.policyVersion,
      r.staleVersion,
      r.locale,
      r.page,
      r.ipPrefix,
    ]
      .map(esc)
      .join(','),
  );
  return [head.join(','), ...lines].join('\n');
}

export function ConsentLogPage() {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const [draft, setDraft] = useState({ from: '', to: '', action: '', anonymousId: '' });
  const [filters, setFilters] = useState<Filters>({});
  // Keyset pagination position lives in local state, not `filters` — a cursor only means anything
  // relative to how you got there (see `consent.service.ts#log`'s docstring on why keyset was
  // worth it over offset here too), so unlike the filter fields there's no honest way to make
  // "page 4" independently addressable. Any filter change resets it back to page 1.
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const query: ConsentLogQuery = {
    ...filters,
    limit: PAGE,
    cursor: cursorStack[cursorStack.length - 1],
  };
  const log = useConsentLog(query);
  const exportMut = useConsentLogExport();

  function apply(e: React.FormEvent) {
    e.preventDefault();
    setFilters({
      from: draft.from ? new Date(draft.from).toISOString() : undefined,
      to: draft.to ? new Date(draft.to).toISOString() : undefined,
      action: draft.action || undefined,
      anonymousId: draft.anonymousId.trim() || undefined,
    });
    setCursorStack([]);
  }

  // Same drill-down pattern as the Audit log page's actor/target cells: clicking a visitor id
  // narrows straight to "everything this visitor consented to" — the actual GDPR Art. 7
  // accountability question ops needs to answer for a dispute or subject-access request — without
  // ever needing to copy a raw id into the filter field by hand. Refines in place; other filters
  // (date range, action) stay as they were.
  function filterByVisitor(anonymousId: string) {
    setDraft((d) => ({ ...d, anonymousId }));
    setFilters((f) => ({ ...f, anonymousId }));
    setCursorStack([]);
  }

  function goNext() {
    if (log.data?.nextCursor) setCursorStack((s) => [...s, log.data!.nextCursor!]);
  }
  function goPrev() {
    setCursorStack((s) => s.slice(0, -1));
  }

  // Exports every event matching the current filter (not just the page on screen) — see
  // useConsentLogExport for why that distinction matters for a compliance export.
  async function downloadCsv() {
    try {
      const { entries, truncated } = await exportMut.mutateAsync({
        from: filters.from,
        to: filters.to,
        action: filters.action,
        anonymousId: filters.anonymousId,
      });
      const blob = new Blob([toCsv(entries)], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `consent-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if (truncated) {
        toast({ title: t('ops.consent.log.exportTruncated', { n: entries.length }) });
      } else {
        toast({
          title: t('ops.consent.log.exportDone', { n: entries.length }),
          variant: 'success',
        });
      }
    } catch {
      toast({ title: t('ops.consent.log.exportFail') });
    }
  }

  const s = log.data?.summary;
  const yesNo = (v: boolean) => (
    <Badge variant={v ? 'success' : 'neutral'}>{v ? t('ops.consent.log.yes') : '—'}</Badge>
  );

  const columns: Array<DataTableColumn<ConsentLogEntry>> = [
    {
      key: 'at',
      header: t('ops.consent.log.when'),
      cell: (r) => fmt.dateTime(r.at),
      className: 'pe-3 text-xs text-muted-foreground whitespace-nowrap',
    },
    {
      key: 'action',
      header: t('ops.consent.log.action'),
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          {t(`ops.consent.action.${r.action}`)}
          {r.staleVersion ? <Badge variant="warning">{t('ops.consent.log.stale')}</Badge> : null}
        </span>
      ),
      className: 'pe-3',
    },
    {
      key: 'fn',
      header: t('ops.consent.cat.functional'),
      cell: (r) => yesNo(r.choices.functional),
    },
    { key: 'an', header: t('ops.consent.cat.analytics'), cell: (r) => yesNo(r.choices.analytics) },
    { key: 'mk', header: t('ops.consent.cat.marketing'), cell: (r) => yesNo(r.choices.marketing) },
    {
      key: 'v',
      header: t('ops.consent.log.policy'),
      cell: (r) => `v${r.policyVersion}`,
      className: 'pe-3 text-xs',
    },
    { key: 'loc', header: t('ops.consent.log.locale'), cell: (r) => r.locale, className: 'pe-3' },
    {
      key: 'id',
      header: t('ops.consent.log.visitor'),
      cell: (r) =>
        r.anonymousId ? (
          <button
            type="button"
            className="font-mono text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
            title={t('ops.consent.log.filterByVisitor')}
            onClick={() => filterByVisitor(r.anonymousId!)}
          >
            {r.anonymousId.slice(0, 8)}
          </button>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.consent.log.title')} description={t('ops.consent.log.subtitle')} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('ops.consent.log.total')} value={s?.total ?? 0} />
        <StatCard
          label={t('ops.consent.log.optIn', { c: t('ops.consent.cat.functional') })}
          value={s ? `${s.optInPct.functional}%` : '—'}
        />
        <StatCard
          label={t('ops.consent.log.optIn', { c: t('ops.consent.cat.analytics') })}
          value={s ? `${s.optInPct.analytics}%` : '—'}
        />
        <StatCard
          label={t('ops.consent.log.optIn', { c: t('ops.consent.cat.marketing') })}
          value={s ? `${s.optInPct.marketing}%` : '—'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('ops.consent.log.events')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-end gap-3" onSubmit={apply}>
            <label className="space-y-1 text-sm">
              <span className="block text-muted-foreground">{t('ops.consent.log.from')}</span>
              <Input
                type="date"
                value={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-muted-foreground">{t('ops.consent.log.to')}</span>
              <Input
                type="date"
                value={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-muted-foreground">{t('ops.consent.log.action')}</span>
              <select
                className={selectClass}
                aria-label={t('ops.consent.log.action')}
                value={draft.action}
                onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a ? t(`ops.consent.action.${a}`) : t('ops.consent.log.allActions')}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-muted-foreground">
                {t('ops.consent.log.filterByVisitor')}
              </span>
              <Input
                className="w-56 font-mono"
                placeholder={t('ops.consent.log.filterByVisitorHint')}
                value={draft.anonymousId}
                onChange={(e) => setDraft((d) => ({ ...d, anonymousId: e.target.value }))}
              />
            </label>
            <Button type="submit" variant="outline">
              {t('ops.consent.log.apply')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={downloadCsv}
              loading={exportMut.isPending}
              disabled={!log.data?.entries.length}
            >
              {t('ops.consent.log.export')}
            </Button>
          </form>

          {log.isLoading ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : !log.data?.entries.length ? (
            <p className="text-sm text-muted-foreground">{t('ops.consent.log.empty')}</p>
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={log.data.entries}
                rowKey={(r) => r.id}
                labels={{
                  loading: '…',
                  loadFailTitle: t('ops.consent.log.empty'),
                  retry: t('ops.consent.log.apply'),
                  empty: t('ops.consent.log.empty'),
                }}
                testid="consent-log-table"
              />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {t('ops.consent.log.showing', {
                    // every page in `cursorStack`'s history was, by construction, a full page (it
                    // only got pushed because it had a `nextCursor`), so this stays exact at any
                    // depth — the same guarantee the old offset math had, just derived from how
                    // many pages we've advanced through instead of a literal row offset.
                    from: cursorStack.length * PAGE + 1,
                    to: cursorStack.length * PAGE + log.data.entries.length,
                    total: log.data.total,
                  })}
                </span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={cursorStack.length === 0}
                    onClick={goPrev}
                  >
                    {t('ops.consent.log.prev')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!log.data.nextCursor}
                    onClick={goNext}
                  >
                    {t('ops.consent.log.next')}
                  </Button>
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
