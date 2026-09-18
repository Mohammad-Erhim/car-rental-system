import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { Car, ListChecks, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { DeactivateDialog, type ActiveTarget } from './active-dialog';
import { CategorySpecs, CategoryThumb, RowActions } from './category-parts';
import { CategorySheet } from './category-sheet';

import { ActiveBadge } from '@/components/active-badge';
import { DataTable } from '@/components/data-table/data-table';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCatalogueCategories, useSetCategoryActive, type CategoryView } from '@/lib/admin-hooks';
import { PAGE_SIZES, useListParams } from '@/lib/use-list-params';

const PARAMS = ['status'] as const;
const STATUSES = ['all', 'active', 'inactive'] as const;
type Status = (typeof STATUSES)[number];
const getRowId = (c: CategoryView) => c.id;

type Modal =
  | { kind: 'category'; category: CategoryView | null }
  | { kind: 'deactivate'; target: ActiveTarget };

/**
 * SCREEN-OPS-013/025 — vehicle categories. Passengers, luggage, doors, transmission and features
 * shown on the public site's vehicle cards come from this data; nothing else holds them. The
 * feature list categories pick from is managed on its own page. The list is small and bounded,
 * so filtering and paging happen in the browser.
 */
export function CategoriesPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('catalogue.manage');
  const { state, update } = useListParams(PARAMS);
  const status: Status = (STATUSES as readonly string[]).includes(state.status)
    ? (state.status as Status)
    : 'all';
  const [modal, setModal] = useState<Modal | null>(null);

  const categories = useCatalogueCategories();
  const setActive = useSetCategoryActive();
  const all = useMemo(() => categories.data ?? [], [categories.data]);

  const inStatus = (c: CategoryView, s: Status) => s === 'all' || (s === 'active') === c.isActive;
  const count = (s: Status) => all.filter((c) => inStatus(c, s)).length;
  const visible = all.filter((c) => inStatus(c, status));

  const total = visible.length;
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
  const page = Math.min(state.page, pageCount);
  const pageRows = visible.slice((page - 1) * state.pageSize, page * state.pageSize);

  const open = (category: CategoryView | null) => setModal({ kind: 'category', category });
  const deactivate = (c: CategoryView) =>
    setModal({
      kind: 'deactivate',
      target: { kind: 'category', code: c.code, name: c.displayName },
    });
  const restore = async (c: CategoryView) => {
    try {
      await setActive.mutateAsync({ code: c.code, active: true });
      toast.success(t('ops.cat.restored'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ops.cat.toggleFail'));
    }
  };

  const columns = useMemo<ColumnDef<CategoryView, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('ops.cat.displayName'),
        cell: ({ row: { original: c } }) => (
          <div className="flex items-center gap-3">
            <CategoryThumb c={c} className="h-10 w-14" />
            <span className="min-w-0">
              <span className="block font-medium">{c.displayName}</span>
              <span className="bidi-isolate block font-mono text-xs text-muted-foreground">
                {c.code}
              </span>
            </span>
          </div>
        ),
      },
      {
        id: 'class',
        header: t('ops.cat.class'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: c } }) => <span>{c.class}</span>,
      },
      {
        id: 'specs',
        header: t('ops.cat.specs'),
        cell: ({ row: { original: c } }) => <CategorySpecs c={c} />,
      },
      {
        id: 'features',
        header: t('ops.cat.features'),
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row: { original: c } }) => (
          <span className="text-muted-foreground">
            {c.features.length
              ? t('ops.cat.featuresN', { n: c.features.length })
              : t('ops.cat.noneSelected')}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('ops.tbl.status'),
        cell: ({ row: { original: c } }) => <ActiveBadge active={c.isActive} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'w-12 text-end' },
        cell: ({ row: { original: c } }) => (
          <RowActions
            active={c.isActive}
            onEdit={() => open(c)}
            onDeactivate={() => deactivate(c)}
            onRestore={() => void restore(c)}
          />
        ),
      },
    ],
    [t],
  );

  const close = (o: boolean) => {
    if (!o) setModal(null);
  };

  return (
    <Page>
      <PageHeader
        title={t('ops.cat.title')}
        description={t('ops.cat.subtitle')}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/catalogue/categories/features" data-testid="manage-features">
                <ListChecks aria-hidden="true" />
                {t('ops.cat.manageFeatures')}
              </Link>
            </Button>
            {canManage ? (
              <Button onClick={() => open(null)} data-testid="category-new">
                <Plus aria-hidden="true" />
                {t('ops.cat.newShort')}
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="p-4 sm:p-5">
        <StateSwitcher
          label={t('ops.tbl.status')}
          value={status}
          onChange={(v) => update({ status: v === 'all' ? '' : v })}
          testIdPrefix="cat-status"
          options={[
            { value: 'all', label: `${t('ops.rp.tabAll')} (${count('all')})` },
            { value: 'active', label: `${t('ops.cat.active')} (${count('active')})` },
            { value: 'inactive', label: `${t('ops.cat.inactive')} (${count('inactive')})` },
          ]}
        />
      </Card>

      <section aria-label={t('ops.cat.card')} data-testid="categories-table">
        <DataTable
          label={t('ops.cat.card')}
          columns={columns}
          data={pageRows}
          getRowId={getRowId}
          loading={categories.isLoading}
          fetching={categories.isFetching}
          bodyTestId="categories-rows"
          onRowClick={canManage ? open : undefined}
          renderCard={(c) => (
            <div className="flex items-start gap-3 p-4">
              <button
                type="button"
                disabled={!canManage}
                onClick={() => open(c)}
                className="flex min-w-0 flex-1 items-start gap-3 text-start"
              >
                <CategoryThumb c={c} className="h-14 w-20" />
                <span className="min-w-0 space-y-1">
                  <span className="block font-medium">{c.displayName}</span>
                  <span className="block text-xs text-muted-foreground">
                    <span className="bidi-isolate font-mono">{c.code}</span>
                    {c.class === c.code ? '' : ` · ${c.class}`}
                  </span>
                  <span className="block text-xs">
                    <CategorySpecs c={c} />
                  </span>
                  <ActiveBadge active={c.isActive} />
                </span>
              </button>
              <RowActions
                active={c.isActive}
                onEdit={() => open(c)}
                onDeactivate={() => deactivate(c)}
                onRestore={() => void restore(c)}
              />
            </div>
          )}
          error={
            categories.isError ? (
              <StateView
                kind="error"
                title={t('ops.cat.loadFail')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void categories.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={
            <StateView
              icon={Car}
              title={t(all.length ? 'ops.cat.noMatch' : 'ops.cat.emptyNow')}
              className="py-14"
            >
              {canManage && !all.length ? (
                <Button size="sm" onClick={() => open(null)}>
                  <Plus aria-hidden="true" />
                  {t('ops.cat.newTitle')}
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

      {modal?.kind === 'category' ? (
        <CategorySheet
          category={modal.category}
          existingCodes={all.map((c) => c.code)}
          open
          onOpenChange={close}
        />
      ) : null}
      {modal?.kind === 'deactivate' ? (
        <DeactivateDialog target={modal.target} open onOpenChange={close} />
      ) : null}
    </Page>
  );
}
