import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Download, ScrollText, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ActorSearch } from './actor-search';
import { AuditDetailSheet } from './audit-detail-sheet';
import { actionLabel, OutcomeBadge, targetLabel } from './audit-labels';
import {
  COMMON_ACTIONS,
  OUTCOMES,
  PAGE,
  shownRange,
  SURFACES,
  toCsv,
  toQuery,
  shortId,
} from './audit-model';

import { DataTable } from '@/components/data-table/data-table';
import { FilterChips, type FilterChip } from '@/components/filter-chips';
import { FiltersSheet } from '@/components/filters-sheet';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuditLog, useAuditLogExport, type AuditRow } from '@/lib/admin-hooks';
import { useListParams } from '@/lib/use-list-params';

const PARAMS = [
  'action',
  'targetType',
  'targetId',
  'actorId',
  'outcome',
  'surface',
  'from',
  'to',
] as const;
const getRowId = (r: AuditRow) => r.id;

/**
 * SCREEN-OPS-038 — Audit & activity. An append-only view of consequential actions; sensitive values
 * in the before/after snapshots are masked when written (SRS-SEC-011) and never un-masked here.
 * Every filter lives in the URL, so any combination is a valid deep link (the Staff page's
 * "History" is one). Paging is keyset (a cursor), which costs the same at any depth but means
 * "page 4" is not bookmarkable — the cursors are kept in component state.
 */
export function AuditLogPage() {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const { state, update } = useListParams(PARAMS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<AuditRow | null>(null);
  // cursorStack[i] fetched page i + 2 (page 1 has no cursor); a page is only pushed after it was
  // confirmed full, which is what keeps the "Showing a–b" count exact at any depth
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  // a changed filter makes the page you were on meaningless
  const filterKey = PARAMS.map((k) => state[k]).join('|');
  useEffect(() => setCursorStack([]), [filterKey]);

  const query = toQuery(state);
  const log = useAuditLog({ ...query, limit: PAGE, cursor: cursorStack[cursorStack.length - 1] });
  const exporter = useAuditLogExport();
  const data = log.data;

  const filterCount = [
    state.action,
    state.targetType,
    state.targetId,
    state.surface,
    state.from,
    state.to,
  ].filter(Boolean).length;
  const chips: FilterChip<(typeof PARAMS)[number]>[] = [];
  if (state.action) chips.push({ key: 'action', label: state.action });
  if (state.targetType)
    chips.push({ key: 'targetType', label: `${t('ops.audit.filterTarget')}: ${state.targetType}` });
  if (state.targetId)
    chips.push({
      key: 'targetId',
      label: `${t('ops.audit.filterTargetId')}: ${shortId(state.targetId)}…`,
    });
  if (state.actorId) chips.push({ key: 'actorId', label: t('ops.audit.actorChip') });
  if (state.surface) chips.push({ key: 'surface', label: t(`ops.audit.surface.${state.surface}`) });
  if (state.from) chips.push({ key: 'from', label: `${t('ops.search.from')} ${state.from}` });
  if (state.to) chips.push({ key: 'to', label: `${t('ops.search.to')} ${state.to}` });

  async function exportCsv() {
    try {
      const { entries, truncated } = await exporter.mutateAsync(query);
      const url = URL.createObjectURL(new Blob([toCsv(entries)], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if (truncated) toast.warning(t('ops.audit.exportTruncated', { n: entries.length }));
      else toast.success(t('ops.audit.exportDone', { n: entries.length }));
    } catch {
      toast.error(t('ops.audit.exportFail'));
    }
  }

  const byTarget = (type: string, id: string) => update({ targetType: type, targetId: id });
  const columns = useMemo<ColumnDef<AuditRow, unknown>[]>(
    () => [
      {
        id: 'when',
        header: t('ops.audit.hWhen'),
        cell: ({ row: { original: r } }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {fmt.dateTime(r.occurredAt)}
          </span>
        ),
      },
      {
        id: 'actor',
        header: t('ops.audit.hActor'),
        cell: ({ row: { original: r } }) => <span className="font-medium">{r.actor}</span>,
      },
      {
        id: 'action',
        header: t('ops.audit.hAction'),
        cell: ({ row: { original: r } }) => (
          <span className="block">
            <span className="block font-medium">{actionLabel(i18n, r.action)}</span>
            <span className="bidi-isolate block font-mono text-xs text-muted-foreground">
              {r.action}
            </span>
          </span>
        ),
      },
      {
        id: 'target',
        header: t('ops.audit.hTarget'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: r } }) =>
          r.targetType ? (
            <span className="text-xs">
              <bdi>{targetLabel(i18n, r.targetType)}</bdi>
              {r.targetId ? (
                <>
                  {' '}
                  <bdi className="text-muted-foreground">· {shortId(r.targetId)}</bdi>
                </>
              ) : null}
            </span>
          ) : (
            '—'
          ),
      },
      {
        id: 'outcome',
        header: t('ops.audit.hOutcome'),
        cell: ({ row: { original: r } }) => <OutcomeBadge outcome={r.outcome} />,
      },
    ],
    [t, fmt],
  );

  const range = data ? shownRange(cursorStack.length, data.entries.length) : null;

  return (
    <Page>
      <PageHeader
        title={t('ops.audit.title')}
        description={t('ops.audit.subtitle')}
        actions={
          <Button
            variant="outline"
            onClick={() => void exportCsv()}
            loading={exporter.isPending}
            disabled={!data?.entries.length}
          >
            <Download aria-hidden="true" />
            {t('ops.audit.export')}
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <StateSwitcher
            label={t('ops.audit.filterOutcome')}
            value={state.outcome || 'all'}
            onChange={(v) => update({ outcome: v === 'all' ? '' : v })}
            testIdPrefix="audit-outcome"
            options={[
              { value: 'all', label: t('ops.audit.allOutcomes') },
              ...OUTCOMES.map((o) => ({ value: o, label: t(`ops.audit.outcome.${o}`) })),
            ]}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {state.actorId ? null : <ActorSearch onSelect={(a) => update({ actorId: a.id })} />}
            <Button
              variant="outline"
              className="h-11 shrink-0 sm:h-10"
              onClick={() => setFiltersOpen(true)}
              data-testid="audit-filters"
            >
              <SlidersHorizontal aria-hidden="true" />
              {t('ops.search.filters')}
              {filterCount ? (
                <Badge className="ms-0.5 px-1.5 tabular-nums">{filterCount}</Badge>
              ) : null}
            </Button>
          </div>
        </div>
        <FilterChips chips={chips} onRemove={(key) => update({ [key]: '' })} />
      </Card>

      <section aria-label={t('ops.audit.events')} data-testid="audit-table">
        <DataTable
          label={t('ops.audit.events')}
          columns={columns}
          data={data?.entries ?? []}
          getRowId={getRowId}
          loading={log.isLoading}
          fetching={log.isFetching}
          bodyTestId="audit-rows"
          onRowClick={setDetail}
          renderCard={(r) => (
            <button
              type="button"
              onClick={() => setDetail(r)}
              className="block w-full space-y-1.5 p-4 text-start"
              data-action={r.action}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-medium">{actionLabel(i18n, r.action)}</span>
                <OutcomeBadge outcome={r.outcome} />
              </span>
              <span className="block text-sm">{r.actor}</span>
              <span className="block text-xs text-muted-foreground">
                {fmt.dateTime(r.occurredAt)}
                {r.targetType ? ` · ${targetLabel(i18n, r.targetType)}` : ''}
              </span>
              <span className="bidi-isolate block break-all font-mono text-xs text-muted-foreground">
                {r.action}
              </span>
            </button>
          )}
          error={
            log.isError ? (
              <StateView
                kind="error"
                title={t('ops.audit.loadFail')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void log.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={<StateView icon={ScrollText} title={t('ops.audit.empty')} className="py-14" />}
        />
        {data && data.total > 0 && range ? (
          <nav
            aria-label={t('ops.pager.label')}
            className="mt-4 flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t('ops.audit.showing', { ...range, total: fmt.number(data.total) })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={cursorStack.length === 0}
                onClick={() => setCursorStack((s) => s.slice(0, -1))}
              >
                <ChevronLeft className="rtl:rotate-180" aria-hidden="true" />
                {t('ops.audit.prev')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.nextCursor}
                onClick={() => setCursorStack((s) => [...s, data.nextCursor!])}
              >
                {t('ops.audit.next')}
                <ChevronRight className="rtl:rotate-180" aria-hidden="true" />
              </Button>
            </div>
          </nav>
        ) : null}
      </section>

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        fields={[
          {
            type: 'text',
            name: 'action',
            label: t('ops.audit.filterAction'),
            hint: t('ops.audit.actionHint'),
            suggestions: COMMON_ACTIONS,
            mono: true,
          },
          {
            type: 'text',
            name: 'targetType',
            label: t('ops.audit.filterTarget'),
            hint: t('ops.audit.targetHint'),
          },
          {
            type: 'text',
            name: 'targetId',
            label: t('ops.audit.filterTargetId'),
            hint: t('ops.audit.targetIdHint'),
            mono: true,
          },
          {
            type: 'select',
            name: 'surface',
            label: t('ops.audit.filterSurface'),
            anyLabel: t('ops.audit.allSurfaces'),
            options: SURFACES.map((s) => ({ value: s, label: t(`ops.audit.surface.${s}`) })),
          },
          { type: 'dateRange', fromLabel: t('ops.search.from'), toLabel: t('ops.search.to') },
        ]}
        values={{
          action: state.action,
          targetType: state.targetType,
          targetId: state.targetId,
          surface: state.surface,
          from: state.from,
          to: state.to,
        }}
        onApply={(v) =>
          update({
            action: v.action?.trim() ?? '',
            targetType: v.targetType?.trim() ?? '',
            targetId: v.targetId?.trim() ?? '',
            surface: v.surface ?? '',
            from: v.from ?? '',
            to: v.to ?? '',
          })
        }
      />

      {detail ? (
        <AuditDetailSheet
          row={detail}
          onActor={(id) => update({ actorId: id })}
          onTarget={byTarget}
          open
          onOpenChange={(o) => !o && setDetail(null)}
        />
      ) : null}
    </Page>
  );
}
