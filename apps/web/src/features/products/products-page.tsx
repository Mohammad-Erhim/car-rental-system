import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ProductSheet } from './product-sheet';

import { ActiveBadge } from '@/components/active-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { FilterChips, type FilterChip } from '@/components/filter-chips';
import { FiltersSheet } from '@/components/filters-sheet';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
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
import {
  useCatalogueProducts,
  useSetProductActive,
  type CatalogueProduct,
} from '@/lib/admin-hooks';
import { useClientPage } from '@/lib/use-client-page';
import { useListParams } from '@/lib/use-list-params';

const PARAMS = ['status', 'kind'] as const;
const STATUSES = ['all', 'active', 'inactive'] as const;
type Status = (typeof STATUSES)[number];
const getRowId = (p: CatalogueProduct) => p.id;

type Modal =
  | { kind: 'sheet'; product: CatalogueProduct | null }
  | { kind: 'deactivate'; product: CatalogueProduct };

/**
 * SCREEN-OPS-027 / FR-ADM-006 — extras & protection. The server owns the price; a booking
 * snapshots the code, label and price it accepted, so repricing here never rewrites a past
 * agreement. The list is small and bounded, so filtering and paging happen in the browser.
 */
export function ProductsPage() {
  const { t, fmt } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('catalogue.manage');
  const { state, update } = useListParams(PARAMS);
  const status: Status = (STATUSES as readonly string[]).includes(state.status)
    ? (state.status as Status)
    : 'all';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);

  const products = useCatalogueProducts();
  const setActive = useSetProductActive();
  const all = useMemo(() => products.data ?? [], [products.data]);

  const inKind = (p: CatalogueProduct) => !state.kind || p.kind === state.kind;
  const inStatus = (p: CatalogueProduct, s: Status) => s === 'all' || (s === 'active') === p.active;
  const count = (s: Status) => all.filter((p) => inKind(p) && inStatus(p, s)).length;
  const visible = useMemo(
    () => all.filter((p) => inKind(p) && inStatus(p, status)),
    [all, state.kind, status],
  );
  const { pageRows, pagination } = useClientPage(visible, state, update);

  const chips: FilterChip<'kind'>[] = state.kind
    ? [
        {
          key: 'kind',
          label: t(state.kind === 'protection' ? 'ops.prod.kindProtection' : 'ops.prod.kindExtra'),
        },
      ]
    : [];

  const open = (product: CatalogueProduct | null) => setModal({ kind: 'sheet', product });
  const restore = async (p: CatalogueProduct) => {
    try {
      await setActive.mutateAsync({ code: p.code, active: true });
      toast.success(t('ops.prod.restored'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ops.prod.toggleFail'));
    }
  };

  const unitLabel = (p: CatalogueProduct) =>
    `${t(p.pricingUnit === 'per_day' ? 'ops.prod.perDay' : 'ops.prod.perRental')}${
      p.taxable ? '' : ` · ${t('ops.prod.notTaxed')}`
    }`;
  const scopeLabel = (p: CatalogueProduct) =>
    [
      p.categoryScope.length ? p.categoryScope.join(', ') : t('ops.prod.allCategories'),
      p.locationScope.length ? p.locationScope.join(', ') : t('ops.prod.allLocations'),
    ].join(' · ');
  const kindBadge = (p: CatalogueProduct) => (
    <Badge variant={p.kind === 'protection' ? 'default' : 'outline'}>
      {t(p.kind === 'protection' ? 'ops.prod.kindProtection' : 'ops.prod.kindExtra')}
    </Badge>
  );

  const actions = (p: CatalogueProduct) =>
    canManage ? (
      <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('ops.resv.moreActions')}>
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[10rem]">
            <DropdownMenuItem onSelect={() => open(p)}>
              <Pencil aria-hidden="true" />
              {t('ops.prod.edit')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {p.active ? (
              <DropdownMenuItem
                onSelect={() => setModal({ kind: 'deactivate', product: p })}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 aria-hidden="true" />
                {t('ops.prod.deactivate')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => void restore(p)}>
                <RotateCcw aria-hidden="true" />
                {t('ops.prod.restore')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ) : null;

  const columns = useMemo<ColumnDef<CatalogueProduct, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('ops.prod.name'),
        cell: ({ row: { original: p } }) => (
          <span>
            <span className="block font-medium">{p.name}</span>
            <span className="bidi-isolate block font-mono text-xs text-muted-foreground">
              {p.code}
            </span>
          </span>
        ),
      },
      { id: 'kind', header: t('ops.prod.kind'), cell: ({ row: { original: p } }) => kindBadge(p) },
      {
        id: 'price',
        header: t('ops.prod.price'),
        cell: ({ row: { original: p } }) => (
          <span>
            <span className="block font-medium tabular-nums">
              {fmt.money({ amountMinor: p.unitPriceMinor, currency: p.currency })}
            </span>
            <span className="block text-xs text-muted-foreground">{unitLabel(p)}</span>
          </span>
        ),
      },
      {
        id: 'max',
        header: t('ops.prod.maxQty'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: p } }) => <span className="tabular-nums">{p.maxQuantity}</span>,
      },
      {
        id: 'scope',
        header: t('ops.prod.scope'),
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row: { original: p } }) => (
          <span className="text-muted-foreground">{scopeLabel(p)}</span>
        ),
      },
      {
        id: 'status',
        header: t('ops.tbl.status'),
        cell: ({ row: { original: p } }) => <ActiveBadge active={p.active} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'w-12 text-end' },
        cell: ({ row: { original: p } }) => actions(p),
      },
    ],
    [t, fmt, canManage],
  );

  const close = (o: boolean) => {
    if (!o) setModal(null);
  };

  return (
    <Page>
      <PageHeader
        title={t('ops.prod.title')}
        description={t('ops.prod.subtitle')}
        actions={
          canManage ? (
            <Button onClick={() => open(null)} data-testid="product-new">
              <Plus aria-hidden="true" />
              {t('ops.prod.newTitle')}
            </Button>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 p-4 sm:justify-between sm:p-5">
          <StateSwitcher
            className="flex-1 sm:flex-none"
            label={t('ops.tbl.status')}
            value={status}
            onChange={(v) => update({ status: v === 'all' ? '' : v })}
            testIdPrefix="prod-status"
            options={[
              { value: 'all', label: `${t('ops.rp.tabAll')} (${count('all')})` },
              { value: 'active', label: `${t('ops.cat.active')} (${count('active')})` },
              { value: 'inactive', label: `${t('ops.cat.inactive')} (${count('inactive')})` },
            ]}
          />
          <Button
            variant="outline"
            className="h-11 shrink-0 sm:h-10"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal aria-hidden="true" />
            {t('ops.search.filters')}
            {state.kind ? <Badge className="ms-0.5 px-1.5 tabular-nums">1</Badge> : null}
          </Button>
        </div>
        <FilterChips chips={chips} onRemove={(key) => update({ [key]: '' })} />
      </Card>

      <section aria-label={t('ops.prod.card')} data-testid="products-table">
        <DataTable
          label={t('ops.prod.card')}
          columns={columns}
          data={pageRows}
          getRowId={getRowId}
          loading={products.isLoading}
          fetching={products.isFetching}
          bodyTestId="products-rows"
          onRowClick={canManage ? open : undefined}
          renderCard={(p) => (
            <div className="flex items-start gap-3 p-4">
              <button
                type="button"
                disabled={!canManage}
                onClick={() => open(p)}
                className="min-w-0 flex-1 space-y-1.5 text-start"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="font-medium">{p.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {fmt.money({ amountMinor: p.unitPriceMinor, currency: p.currency })}
                  </span>
                </span>
                <span className="block text-xs text-muted-foreground">{unitLabel(p)}</span>
                <span className="flex flex-wrap items-center gap-2">
                  {kindBadge(p)}
                  <ActiveBadge active={p.active} />
                </span>
              </button>
              {actions(p)}
            </div>
          )}
          error={
            products.isError ? (
              <StateView
                kind="error"
                title={t('ops.prod.loadFail')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void products.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={
            <StateView
              icon={Package}
              title={t(all.length ? 'ops.cat.noMatch' : 'ops.prod.emptyNow')}
              className="py-14"
            >
              {canManage && !all.length ? (
                <Button size="sm" onClick={() => open(null)}>
                  <Plus aria-hidden="true" />
                  {t('ops.prod.newTitle')}
                </Button>
              ) : null}
            </StateView>
          }
          pagination={pagination}
        />
      </section>

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        fields={[
          {
            type: 'select',
            name: 'kind',
            label: t('ops.prod.kind'),
            anyLabel: t('ops.prod.anyKind'),
            options: [
              { value: 'extra', label: t('ops.prod.kindExtra') },
              { value: 'protection', label: t('ops.prod.kindProtection') },
            ],
          },
        ]}
        values={{ kind: state.kind }}
        onApply={(v) => update({ kind: v.kind ?? '' })}
      />

      {modal?.kind === 'sheet' ? (
        <ProductSheet
          product={modal.product}
          existingCodes={all.map((p) => p.code)}
          open
          onOpenChange={close}
        />
      ) : null}
      {modal?.kind === 'deactivate' ? (
        <ConfirmDialog
          open
          onOpenChange={close}
          destructive
          title={t('ops.prod.deactivateTitle', { name: modal.product.name })}
          description={t('ops.prod.deactivateBody')}
          confirmLabel={t('ops.prod.deactivate')}
          onConfirm={async () => {
            await setActive.mutateAsync({ code: modal.product.code, active: false });
            toast.success(t('ops.prod.deactivated'));
          }}
        />
      ) : null}
    </Page>
  );
}
