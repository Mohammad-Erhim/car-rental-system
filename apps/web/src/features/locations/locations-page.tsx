import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArchiveRestore, Eye, MapPin, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ArchiveDialog, LocationStatus, useRestoreLocation } from './location-parts';
import { LocationSheet } from './location-sheet';

import { DataTable } from '@/components/data-table/data-table';
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
import { useOpsLocations, type OpsLocation } from '@/lib/admin-hooks';
import { useClientPage } from '@/lib/use-client-page';
import { useListParams } from '@/lib/use-list-params';

const PARAMS = ['status'] as const;
const STATUSES = ['all', 'active', 'draft', 'archived'] as const;
type Status = (typeof STATUSES)[number];
const getRowId = (l: OpsLocation) => l.id;

type Modal =
  | { kind: 'sheet'; location: OpsLocation | null }
  | { kind: 'archive'; location: OpsLocation };

/**
 * SCREEN-OPS-028 / FR-ADM-007 — where cars are picked up and returned. This list is for finding a
 * location and adding one; a location's hours, closures and instructions live on its own page.
 * Locations are archived, never deleted.
 */
export function LocationsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canPublish = hasPermission('config.publish');
  const { state, update } = useListParams(PARAMS);
  const status: Status = (STATUSES as readonly string[]).includes(state.status)
    ? (state.status as Status)
    : 'all';
  const [modal, setModal] = useState<Modal | null>(null);
  const restore = useRestoreLocation();

  const locations = useOpsLocations();
  const all = useMemo(() => locations.data ?? [], [locations.data]);
  const count = (s: Status) => all.filter((l) => s === 'all' || l.status === s).length;
  const visible = useMemo(
    () => all.filter((l) => status === 'all' || l.status === status),
    [all, status],
  );
  const { pageRows, pagination } = useClientPage(visible, state, update);

  const view = (l: OpsLocation) => navigate(`/config/locations/${l.code}`);
  const menu = (l: OpsLocation) => (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t('ops.resv.moreActions')}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[10rem]">
          <DropdownMenuItem onSelect={() => view(l)}>
            <Eye aria-hidden="true" />
            {t('action.viewDetails')}
          </DropdownMenuItem>
          {canPublish ? (
            <>
              {l.status !== 'archived' ? (
                <DropdownMenuItem onSelect={() => setModal({ kind: 'sheet', location: l })}>
                  <Pencil aria-hidden="true" />
                  {t('ops.cat.edit')}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              {l.status === 'archived' ? (
                <DropdownMenuItem onSelect={() => void restore(l)}>
                  <ArchiveRestore aria-hidden="true" />
                  {t('ops.loc.restore')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() => setModal({ kind: 'archive', location: l })}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 aria-hidden="true" />
                  {t('ops.loc.archive')}
                </DropdownMenuItem>
              )}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const columns = useMemo<ColumnDef<OpsLocation, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('ops.loc.name'),
        cell: ({ row: { original: l } }) => (
          <span>
            <Link
              to={`/config/locations/${l.code}`}
              onClick={(e) => e.stopPropagation()}
              className="block font-medium hover:underline"
            >
              {l.name}
            </Link>
            <span className="bidi-isolate block font-mono text-xs text-muted-foreground">
              {l.code}
            </span>
          </span>
        ),
      },
      {
        id: 'city',
        header: t('ops.loc.city'),
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row: { original: l } }) => (
          <span className="text-muted-foreground">{l.address?.city || '—'}</span>
        ),
      },
      {
        id: 'zone',
        header: t('ops.loc.timezone'),
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row: { original: l } }) => (
          <span className="bidi-isolate text-muted-foreground">{l.timezone}</span>
        ),
      },
      {
        id: 'categories',
        header: t('ops.loc.categories'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: l } }) =>
          l.supportedCategoryCodes.length ? (
            <span className="tabular-nums">{l.supportedCategoryCodes.length}</span>
          ) : (
            <Badge variant="warning">{t('ops.loc.noCategoriesBadge')}</Badge>
          ),
      },
      {
        id: 'afterHours',
        header: t('ops.loc.afterHoursShort'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: l } }) => (
          <span className="text-muted-foreground">
            {t(l.afterHoursReturn ? 'ops.loc.yes' : 'ops.loc.no')}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('ops.tbl.status'),
        cell: ({ row: { original: l } }) => <LocationStatus status={l.status} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('ops.resv.actions')}</span>,
        meta: { className: 'w-12 text-end' },
        cell: ({ row: { original: l } }) => menu(l),
      },
    ],

    [t, canPublish],
  );

  const close = (o: boolean) => {
    if (!o) setModal(null);
  };

  return (
    <Page>
      <PageHeader
        title={t('ops.loc.title')}
        description={t('ops.loc.subtitle')}
        actions={
          canPublish ? (
            <Button
              onClick={() => setModal({ kind: 'sheet', location: null })}
              data-testid="loc-new"
            >
              <Plus aria-hidden="true" />
              {t('ops.loc.new')}
            </Button>
          ) : null
        }
      />

      <Card className="p-4 sm:p-5">
        <StateSwitcher
          label={t('ops.tbl.status')}
          value={status}
          onChange={(v) => update({ status: v === 'all' ? '' : v })}
          testIdPrefix="loc-status"
          options={[
            { value: 'all', label: `${t('ops.rp.tabAll')} (${count('all')})` },
            { value: 'active', label: `${t('ops.loc.status.active')} (${count('active')})` },
            { value: 'draft', label: `${t('ops.loc.status.draft')} (${count('draft')})` },
            { value: 'archived', label: `${t('ops.loc.status.archived')} (${count('archived')})` },
          ]}
        />
      </Card>

      <section aria-label={t('ops.loc.list')} data-testid="locations-table">
        <DataTable
          label={t('ops.loc.list')}
          columns={columns}
          data={pageRows}
          getRowId={getRowId}
          loading={locations.isLoading}
          fetching={locations.isFetching}
          bodyTestId="locations-rows"
          onRowClick={view}
          renderCard={(l) => (
            <div className="flex items-start gap-3 p-4">
              <Link to={`/config/locations/${l.code}`} className="min-w-0 flex-1 space-y-1.5">
                <span className="block font-medium">{l.name}</span>
                <span className="block text-xs text-muted-foreground">
                  <span className="bidi-isolate font-mono">{l.code}</span>
                  {l.address?.city ? ` · ${l.address.city}` : ''}
                </span>
                <LocationStatus status={l.status} />
              </Link>
              {menu(l)}
            </div>
          )}
          error={
            locations.isError ? (
              <StateView
                kind="error"
                title={t('ops.loc.loadFail')}
                actionLabel={t('ops.st.retry')}
                onAction={() => void locations.refetch()}
                className="py-14"
              />
            ) : undefined
          }
          empty={
            <StateView
              icon={MapPin}
              title={t(all.length ? 'ops.cat.noMatch' : 'ops.loc.emptyNow')}
              className="py-14"
            >
              {canPublish && !all.length ? (
                <Button size="sm" onClick={() => setModal({ kind: 'sheet', location: null })}>
                  <Plus aria-hidden="true" />
                  {t('ops.loc.new')}
                </Button>
              ) : null}
            </StateView>
          }
          pagination={pagination}
        />
      </section>

      {modal?.kind === 'sheet' ? (
        <LocationSheet
          location={modal.location}
          existingCodes={all.map((l) => l.code)}
          open
          onOpenChange={close}
        />
      ) : null}
      {modal?.kind === 'archive' ? (
        <ArchiveDialog location={modal.location} open onOpenChange={close} />
      ) : null}
    </Page>
  );
}
