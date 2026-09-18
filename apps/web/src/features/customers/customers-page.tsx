import { useI18n } from '@carrental/i18n/react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Loader2, Search, SearchX, Users, X } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { CustomerStatus } from './customer-status';

import { DataTable } from '@/components/data-table/data-table';
import { Page, PageHeader } from '@/components/page-header';
import { StateView } from '@/components/state-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useCustomerSearch, type CustomerSearchHit } from '@/lib/admin-hooks';
import { useListParams } from '@/lib/use-list-params';
import { useSearchBox } from '@/lib/use-search-box';

/** The API's hard cap on a search — a deliberate anti-enumeration limit (FR-ADM-001). */
const SEARCH_CAP = 25;
const getRowId = (c: CustomerSearchHit) => c.id;

/**
 * SCREEN-OPS-021 — find a customer by name, email or phone, then open their record. Search only:
 * the API returns at most {@link SEARCH_CAP} matches on purpose, so an ambiguous query has to be
 * refined rather than browsed. Every search is a PII access recorded on the audit trail
 * (SRS-SEC-016).
 */
export function CustomersPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { state, update } = useListParams(['q'] as const);
  const box = useSearchBox(state.q, (q) => update({ q }));
  const search = useCustomerSearch(state.q);
  const tooShort = box.draft.trim().length === 1;
  const open = (id: string) => navigate(`/customers/${encodeURIComponent(id)}`);

  const columns = useMemo<ColumnDef<CustomerSearchHit, unknown>[]>(
    () => [
      {
        id: 'customer',
        header: t('ops.tbl.name'),
        cell: ({ row: { original: c } }) => (
          <div className="space-y-0.5">
            <p className="font-medium">{c.fullName}</p>
            <p className="text-xs text-muted-foreground">{c.email ?? '—'}</p>
          </div>
        ),
      },
      {
        id: 'phone',
        header: t('ops.cust.phone'),
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row: { original: c } }) => (
          <span className="bidi-isolate text-muted-foreground">{c.phone ?? '—'}</span>
        ),
      },
      {
        id: 'status',
        header: t('ops.tbl.status'),
        cell: ({ row: { original: c } }) => (
          <div className="flex flex-wrap gap-1">
            <CustomerStatus status={c.status} />
            {c.restricted ? <Badge variant="warning">{t('ops.cust.restricted')}</Badge> : null}
          </div>
        ),
      },
      {
        id: 'open',
        header: () => <span className="sr-only">{t('action.viewDetails')}</span>,
        meta: { className: 'w-10 pe-4 ps-0 text-end' },
        cell: () => (
          <ArrowRight
            className="size-4 text-muted-foreground rtl:-scale-x-100"
            aria-hidden="true"
          />
        ),
      },
    ],
    [t],
  );

  const results = search.data?.results ?? [];
  const ready = state.q.trim().length >= 2;

  return (
    <Page>
      <PageHeader title={t('ops.cust.title')} description={t('ops.cust.subtitle')} />

      <Card className="p-4 sm:p-5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={box.draft}
            onChange={(e) => box.setDraft(e.target.value)}
            placeholder={t('ops.cust.searchPlaceholder')}
            aria-label={t('ops.cust.search')}
            autoComplete="off"
            autoFocus
            data-testid="cust-search"
            className="h-11 ps-10 pe-10 text-base [&::-webkit-search-cancel-button]:hidden"
          />
          {search.isFetching && ready ? (
            <Loader2
              className="absolute end-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : box.draft ? (
            <button
              type="button"
              onClick={box.clear}
              aria-label={t('action.clear')}
              className="absolute end-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {tooShort ? (
          <p className="mt-2 text-xs text-muted-foreground">{t('ops.cust.min2')}</p>
        ) : null}
      </Card>

      {search.data && search.data.count >= SEARCH_CAP ? (
        <Alert variant="warning">
          <AlertDescription>{t('ops.search.narrowHint')}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-label={t('ops.cust.search')} data-testid="cust-results">
        {!ready ? (
          <Card>
            <StateView
              icon={Users}
              title={t('ops.cust.title')}
              description={t('ops.cust.startTyping')}
              className="py-16"
            />
          </Card>
        ) : (
          <DataTable
            label={t('ops.cust.search')}
            columns={columns}
            data={results}
            getRowId={getRowId}
            loading={search.isLoading}
            fetching={search.isFetching}
            onRowClick={(c) => open(c.id)}
            renderCard={(c) => (
              <button
                type="button"
                onClick={() => open(c.id)}
                data-testid={`cust-hit-${c.id}`}
                className="flex w-full items-center justify-between gap-3 p-4 text-start hover:bg-muted/50"
              >
                <span className="min-w-0 space-y-0.5">
                  <span className="block truncate font-medium">{c.fullName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.email ?? c.phone ?? '—'}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <CustomerStatus status={c.status} />
                  {c.restricted ? (
                    <Badge variant="warning">{t('ops.cust.restricted')}</Badge>
                  ) : null}
                </span>
              </button>
            )}
            skeletonRows={5}
            error={
              search.isError ? (
                <StateView
                  kind="error"
                  title={t('ops.cust.searchFail')}
                  actionLabel={t('ops.st.retry')}
                  onAction={() => void search.refetch()}
                  className="py-14"
                />
              ) : undefined
            }
            empty={
              <StateView
                icon={SearchX}
                title={t('state.noResults.title')}
                description={t('ops.cust.noResults')}
                className="py-14"
              />
            }
          />
        )}
      </section>
    </Page>
  );
}
