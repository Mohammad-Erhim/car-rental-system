import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, ListChecks, Plus, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { DeactivateDialog, type ActiveTarget } from './active-dialog';
import { FEATURE_GROUPS } from './category-model';
import { RowActions } from './category-parts';
import { FeatureDialog } from './feature-dialog';

import { ActiveBadge } from '@/components/active-badge';
import { DataTable } from '@/components/data-table/data-table';
import { FilterChips, type FilterChip } from '@/components/filter-chips';
import { FiltersSheet } from '@/components/filters-sheet';
import { Page, PageHeader } from '@/components/page-header';
import { StateSwitcher } from '@/components/state-switcher';
import { StateView } from '@/components/state-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BreadcrumbLabelSetter } from '@/layouts/breadcrumb-label';
import { useCatalogueFeatures, useSetFeatureActive, type FeatureView } from '@/lib/admin-hooks';
import { PAGE_SIZES, useListParams } from '@/lib/use-list-params';

const PARAMS = ['status', 'group'] as const;
const STATUSES = ['all', 'active', 'inactive'] as const;
type Status = (typeof STATUSES)[number];
const getRowId = (f: FeatureView) => f.code;

type Modal =
  | { kind: 'feature'; feature: FeatureView | null }
  | { kind: 'deactivate'; target: ActiveTarget };

/**
 * The list of features a vehicle category can offer (air conditioning, GPS …). A sub-page of
 * vehicle categories: categories pick from this list, and deactivating an entry only stops it
 * being newly picked — categories that already have it keep it.
 */
export function FeaturesPage() {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('catalogue.manage');
  const { state, update } = useListParams(PARAMS);
  const status: Status = (STATUSES as readonly string[]).includes(state.status)
    ? (state.status as Status)
    : 'all';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);

  const features = useCatalogueFeatures();
  const setActive = useSetFeatureActive();
  const all = useMemo(() => features.data ?? [], [features.data]);

  const inGroup = (f: FeatureView) => !state.group || f.group === state.group;
  const inStatus = (f: FeatureView, s: Status) => s === 'all' || (s === 'active') === f.isActive;
  const count = (s: Status) => all.filter((f) => inGroup(f) && inStatus(f, s)).length;
  const visible = all.filter((f) => inGroup(f) && inStatus(f, status));

  const total = visible.length;
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
  const page = Math.min(state.page, pageCount);
  const pageRows = visible.slice((page - 1) * state.pageSize, page * state.pageSize);

  const chips: FilterChip<'group'>[] = state.group
    ? [{ key: 'group', label: t(`ops.cat.group.${state.group}`) }]
    : [];

  const open = (feature: FeatureView | null) => setModal({ kind: 'feature', feature });
  const deactivate = (f: FeatureView) =>
    setModal({ kind: 'deactivate', target: { kind: 'feature', code: f.code, name: f.label } });
  const restore = async (f: FeatureView) => {
    try {
      await setActive.mutateAsync({ code: f.code, active: true });
      toast.success(t('ops.cat.featureRestored'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ops.cat.toggleFail'));
    }
  };

  const columns = useMemo<ColumnDef<FeatureView, unknown>[]>(
    () => [
      {
        id: 'label',
        header: t('ops.cat.featureLabel'),
        cell: ({ row: { original: f } }) => <span className="font-medium">{f.label}</span>,
      },
      {
        id: 'code',
        header: t('ops.cat.code'),
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row: { original: f } }) => (
          <span className="bidi-isolate font-mono text-xs text-muted-foreground">{f.code}</span>
        ),
      },
      {
        id: 'group',
        header: t('ops.cat.group'),
        cell: ({ row: { original: f } }) => (
          <Badge variant="outline">{t(`ops.cat.group.${f.group}`)}</Badge>
        ),
      },
      {
        id: 'sort',
        header: t('ops.cat.sortOrder'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: f } }) => (
          <span className="tabular-nums text-muted-foreground">{f.sortOrder}</span>
        ),
      },
      {
        id: 'status',
        header: t('ops.tbl.status'),
        cell: ({ row: { original: f } }) => <ActiveBadge active={f.isActive} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'w-12 text-end' },
        cell: ({ row: { original: f } }) => (
          <RowActions
            active={f.isActive}
            onEdit={() => open(f)}
            onDeactivate={() => deactivate(f)}
            onRestore={() => void restore(f)}
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
      <BreadcrumbLabelSetter label={t('ops.cat.featuresTitle')} />
      <div className="-mb-2">
        <Button variant="ghost" size="sm" className="-ms-2.5 text-muted-foreground" asChild>
          <Link to="/catalogue/categories" data-testid="features-back">
            <ArrowLeft className="rtl:rotate-180" aria-hidden="true" />
            {t('ops.cat.backToCategories')}
          </Link>
        </Button>
      </div>
      <PageHeader
        title={t('ops.cat.featuresTitle')}
        description={t('ops.cat.featuresSubtitle')}
        actions={
          canManage ? (
            <Button onClick={() => open(null)} data-testid="feature-new">
              <Plus aria-hidden="true" />
              {t('ops.cat.featureNewTitle')}
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
            testIdPrefix="feat-status"
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
            {state.group ? <Badge className="ms-0.5 px-1.5 tabular-nums">1</Badge> : null}
          </Button>
        </div>
        <FilterChips chips={chips} onRemove={(key) => update({ [key]: '' })} />
      </Card>

      <section aria-label={t('ops.cat.featuresTitle')} data-testid="features-table">
        <DataTable
          label={t('ops.cat.featuresTitle')}
          columns={columns}
          data={pageRows}
          getRowId={getRowId}
          loading={features.isLoading}
          fetching={features.isFetching}
          bodyTestId="features-rows"
          onRowClick={canManage ? open : undefined}
          renderCard={(f) => (
            <div className="flex items-center gap-3 p-4">
              <button
                type="button"
                disabled={!canManage}
                onClick={() => open(f)}
                className="min-w-0 flex-1 space-y-1.5 text-start"
              >
                <span className="block font-medium">{f.label}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{t(`ops.cat.group.${f.group}`)}</Badge>
                  <ActiveBadge active={f.isActive} />
                </span>
              </button>
              <RowActions
                active={f.isActive}
                onEdit={() => open(f)}
                onDeactivate={() => deactivate(f)}
                onRestore={() => void restore(f)}
              />
            </div>
          )}
          error={
            features.isError ? (
              <StateView
                kind="error"
                title={t('ops.cat.featuresLoadFail')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void features.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={
            <StateView
              icon={ListChecks}
              title={t(all.length ? 'ops.cat.noMatch' : 'ops.cat.noFeaturesNow')}
              className="py-14"
            >
              {canManage && !all.length ? (
                <Button size="sm" onClick={() => open(null)}>
                  <Plus aria-hidden="true" />
                  {t('ops.cat.featureNewTitle')}
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
            name: 'group',
            label: t('ops.cat.group'),
            anyLabel: t('ops.cat.anyGroup'),
            options: FEATURE_GROUPS.map((g) => ({ value: g, label: t(`ops.cat.group.${g}`) })),
          },
        ]}
        values={{ group: state.group }}
        onApply={(v) => update({ group: v.group ?? '' })}
      />

      {modal?.kind === 'feature' ? (
        <FeatureDialog
          feature={modal.feature}
          existingCodes={all.map((f) => f.code)}
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
