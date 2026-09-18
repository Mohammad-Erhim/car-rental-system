import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Copy,
  Rocket,
  MoreHorizontal,
  Pencil,
  Plus,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { PlanDetailSheet, type PlanAction } from './plan-detail-sheet';
import { DeletePlanDialog, PublishDialog } from './plan-dialogs';
import { cloneValues, isEditable, unpricedCategories, type PlanValues } from './plan-model';
import { PlanSheet } from './plan-sheet';
import { PlanStatus } from './plan-status';

import { DataTable } from '@/components/data-table/data-table';
import { FiltersSheet, useFilterFields } from '@/components/filters-sheet';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocations } from '@/lib/discovery-hooks';
import { useOpsCategories, useRatePlans, type RatePlan } from '@/lib/ops-discovery-hooks';
import { PAGE_SIZES, useListParams } from '@/lib/use-list-params';

const PARAMS = ['tab', 'category', 'location'] as const;
const TABS = ['published', 'drafts', 'retired', 'all'] as const;
type Tab = (typeof TABS)[number];
const getRowId = (p: RatePlan) => p.id;

const inTab = (p: RatePlan, tab: Tab) =>
  tab === 'all' ||
  (tab === 'published' && p.status === 'published') ||
  (tab === 'drafts' && isEditable(p.status)) ||
  (tab === 'retired' && p.status === 'retired');

type Modal =
  | { kind: 'detail'; plan: RatePlan }
  | { kind: 'sheet'; plan: RatePlan | null; initial?: PlanValues }
  | { kind: 'publish' | 'delete'; plan: RatePlan };

/**
 * SCREEN-OPS-025/026 — rate plans. Draft → publish; a published plan is immutable (clone it to
 * change a price). Publishing supersedes only the published plans it overlaps in time and takes
 * effect on customer search with no redeploy (§12.5: the publish confirm shows the effect).
 * The list is small and bounded, so filtering and paging happen in the browser.
 */
export function RatePlansPage() {
  const { t, fmt } = useI18n();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');
  const { state, update } = useListParams(PARAMS);
  const tab: Tab = (TABS as readonly string[]).includes(state.tab)
    ? (state.tab as Tab)
    : 'published';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const fieldOf = useFilterFields();

  const plans = useRatePlans();
  const categories = useOpsCategories();
  const locations = useLocations();
  const all = useMemo(() => plans.data ?? [], [plans.data]);

  const scopeName = (code: string | null) =>
    code ? (locations.data?.find((l) => l.code === code)?.name ?? code) : t('ops.rp.allLocations');

  const filtered = useMemo(
    () =>
      all.filter(
        (p) =>
          (!state.category || p.categoryCode === state.category) &&
          (!state.location || (p.locationCode ?? '') === state.location),
      ),
    [all, state.category, state.location],
  );
  const visible = filtered.filter((p) => inTab(p, tab));
  const count = (tb: Tab) => filtered.filter((p) => inTab(p, tb)).length;
  const unpriced = useMemo(
    () => unpricedCategories(categories.data ?? [], all),
    [categories.data, all],
  );

  const total = visible.length;
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
  const page = Math.min(state.page, pageCount);
  const pageRows = visible.slice((page - 1) * state.pageSize, page * state.pageSize);

  const filterCount = [state.category, state.location].filter(Boolean).length;
  const chips: Array<{ key: 'category' | 'location'; label: string }> = [];
  if (state.category) {
    chips.push({
      key: 'category',
      label: categories.data?.find((c) => c.code === state.category)?.displayName ?? state.category,
    });
  }
  if (state.location) chips.push({ key: 'location', label: scopeName(state.location) });

  const open = (m: Modal) => setModal(m);
  const act = (plan: RatePlan, action: PlanAction) => {
    if (action === 'edit') open({ kind: 'sheet', plan });
    else if (action === 'clone') open({ kind: 'sheet', plan: null, initial: cloneValues(plan) });
    else open({ kind: action, plan });
  };

  const columns = useMemo<ColumnDef<RatePlan, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('ops.rp.name'),
        cell: ({ row: { original: p } }) => <span className="font-medium">{p.name}</span>,
      },
      {
        id: 'category',
        header: t('ops.tbl.category'),
        cell: ({ row: { original: p } }) => (
          <span className="bidi-isolate font-mono text-xs">{p.categoryCode}</span>
        ),
      },
      {
        id: 'scope',
        header: t('ops.rp.scope'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: p } }) => (
          <span className="text-muted-foreground">{scopeName(p.locationCode)}</span>
        ),
      },
      {
        id: 'base',
        header: t('ops.tbl.baseDay'),
        meta: { className: 'text-end' },
        cell: ({ row: { original: p } }) => (
          <span className="font-medium tabular-nums">
            {fmt.money({ amountMinor: p.baseDayMinor, currency: p.currency })}
          </span>
        ),
      },
      {
        id: 'tax',
        header: t('ops.tbl.tax'),
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row: { original: p } }) => (
          <span className="tabular-nums">{+(p.taxBps / 100).toFixed(2)}%</span>
        ),
      },
      {
        id: 'effective',
        header: t('ops.rp.effectiveFrom'),
        cell: ({ row: { original: p } }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {fmt.date(p.effectiveFrom)}
            {p.effectiveTo ? ` – ${fmt.date(p.effectiveTo)}` : ''}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('ops.tbl.status'),
        cell: ({ row: { original: p } }) => <PlanStatus status={p.status} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'w-12 text-end' },
        cell: ({ row: { original: p } }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t('ops.resv.moreActions')}>
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[11rem]">
                <DropdownMenuItem onSelect={() => open({ kind: 'detail', plan: p })}>
                  <Tag aria-hidden="true" />
                  {t('action.viewDetails')}
                </DropdownMenuItem>
                {canPublish && isEditable(p.status) ? (
                  <>
                    <DropdownMenuItem onSelect={() => act(p, 'edit')}>
                      <Pencil aria-hidden="true" />
                      {t('ops.rp.editDraft')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => act(p, 'publish')}>
                      <Rocket aria-hidden="true" />
                      {t('ops.rp.publish')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => act(p, 'delete')}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 aria-hidden="true" />
                      {t('ops.rp.deleteDraft')}
                    </DropdownMenuItem>
                  </>
                ) : canPublish ? (
                  <DropdownMenuItem onSelect={() => act(p, 'clone')}>
                    <Copy aria-hidden="true" />
                    {t('ops.rp.clone')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],

    [t, fmt, canPublish, locations.data],
  );

  const close = (o: boolean) => {
    if (!o) setModal(null);
  };

  return (
    <Page>
      <PageHeader
        title={t('ops.rp.title')}
        description={t('ops.rp.subtitle')}
        actions={
          canPublish ? (
            <Button onClick={() => open({ kind: 'sheet', plan: null })} data-testid="rp-new">
              <Plus aria-hidden="true" />
              {t('ops.rp.newDraft')}
            </Button>
          ) : null
        }
      />

      {plans.data && categories.data && unpriced.length ? (
        <Alert variant="warning" data-testid="rp-unpriced">
          <AlertTitle>{t('ops.rp.unpricedTitle')}</AlertTitle>
          <AlertDescription>
            {t('ops.rp.unpriced', { cats: unpriced.map((c) => c.displayName).join(', ') })}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:justify-between sm:p-5">
          <StateSwitcher
            className="flex-1 sm:flex-none"
            label={t('ops.rp.card')}
            value={tab}
            onChange={(v) => update({ tab: v === 'published' ? '' : v })}
            testIdPrefix="rp-tab"
            options={[
              {
                value: 'published',
                label: `${t('ops.cfg.state.published')} (${count('published')})`,
              },
              { value: 'drafts', label: `${t('ops.cfg.state.draft')} (${count('drafts')})` },
              { value: 'retired', label: `${t('ops.cfg.state.retired')} (${count('retired')})` },
              { value: 'all', label: `${t('ops.rp.tabAll')} (${count('all')})` },
            ]}
          />
          <Button
            variant="outline"
            className="h-11 shrink-0 sm:h-10"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal aria-hidden="true" />
            {t('ops.search.filters')}
            {filterCount ? (
              <Badge className="ms-0.5 px-1.5 tabular-nums">{filterCount}</Badge>
            ) : null}
          </Button>
        </div>
        {chips.length ? (
          <ul
            className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-4 py-3 sm:px-5"
            aria-label={t('ops.search.filters')}
          >
            {chips.map((c) => (
              <li key={c.key}>
                <Badge variant="secondary" className="gap-1 py-1 ps-2.5 pe-1 text-xs font-medium">
                  {c.label}
                  <button
                    type="button"
                    onClick={() => update({ [c.key]: '' })}
                    aria-label={t('ops.search.removeFilter', { name: c.label })}
                    className="grid size-4 place-items-center rounded-full hover:bg-foreground/10"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <section aria-label={t('ops.rp.card')} data-testid="rate-plan-table">
        <DataTable
          label={t('ops.rp.card')}
          columns={columns}
          data={pageRows}
          getRowId={getRowId}
          loading={plans.isLoading}
          fetching={plans.isFetching}
          bodyTestId="rate-plan-rows"
          onRowClick={(p) => open({ kind: 'detail', plan: p })}
          renderCard={(p) => (
            <button
              type="button"
              onClick={() => open({ kind: 'detail', plan: p })}
              className="flex w-full items-start justify-between gap-3 p-4 text-start hover:bg-muted/50"
            >
              <span className="min-w-0 space-y-1">
                <span className="block font-medium">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  <span className="bidi-isolate font-mono">{p.categoryCode}</span> ·{' '}
                  {scopeName(p.locationCode)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {fmt.date(p.effectiveFrom)}
                  {p.effectiveTo ? ` – ${fmt.date(p.effectiveTo)}` : ''}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="text-sm font-semibold tabular-nums">
                  {fmt.money({ amountMinor: p.baseDayMinor, currency: p.currency })}
                </span>
                <PlanStatus status={p.status} />
              </span>
            </button>
          )}
          error={
            plans.isError ? (
              <StateView
                kind="error"
                title={t('ops.rp.loadFail')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void plans.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={
            <StateView icon={Tag} title={t('ops.rp.empty')} className="py-14">
              {canPublish && !all.length ? (
                <Button size="sm" onClick={() => open({ kind: 'sheet', plan: null })}>
                  <Plus aria-hidden="true" />
                  {t('ops.rp.newDraft')}
                </Button>
              ) : null}
            </StateView>
          }
          pagination={{
            page,
            pageSize: state.pageSize,
            total,
            pageSizeOptions: PAGE_SIZES,
            onPageChange: (p) => update({ page: p }),
            onPageSizeChange: (s) => update({ pageSize: s }),
          }}
        />
      </section>

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        fields={[
          {
            type: 'select',
            name: 'category',
            label: t('ops.rp.category'),
            anyLabel: t('ops.fleet.anyCategory'),
            options: (categories.data ?? []).map((c) => ({ value: c.code, label: c.displayName })),
          },
          fieldOf.location((locations.data ?? []).map((l) => ({ code: l.code, name: l.name }))),
        ]}
        values={{ category: state.category, location: state.location }}
        onApply={(v) => update({ category: v.category ?? '', location: v.location ?? '' })}
      />

      {modal?.kind === 'detail' ? (
        <PlanDetailSheet
          plan={modal.plan}
          scopeName={scopeName(modal.plan.locationCode)}
          canPublish={canPublish}
          onAction={(a) => act(modal.plan, a)}
          open
          onOpenChange={close}
        />
      ) : null}
      {modal?.kind === 'sheet' ? (
        <PlanSheet plan={modal.plan} initial={modal.initial} open onOpenChange={close} />
      ) : null}
      {modal?.kind === 'publish' ? (
        <PublishDialog
          plan={modal.plan}
          all={all}
          scopeName={scopeName(modal.plan.locationCode)}
          open
          onOpenChange={close}
        />
      ) : null}
      {modal?.kind === 'delete' ? (
        <DeletePlanDialog plan={modal.plan} open onOpenChange={close} />
      ) : null}
    </Page>
  );
}
