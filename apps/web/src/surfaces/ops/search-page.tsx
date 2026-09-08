import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  Field,
  Input,
  PageHeader,
  type DataTableColumn,
} from '@carrental/ui';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useOpsSearch, type SearchHit } from '../../lib/admin-hooks.js';
import { useLocations } from '../../lib/discovery-hooks.js';

/**
 * SCREEN-OPS-004 / FR-ADM-003 — one search across reservations and rentals. Free text matches a
 * reference, the primary driver, or (rentals) the vehicle plate; narrow by kind / status /
 * location. Each row links to the surface that owns the permitted next action. Saved views are a
 * documented follow-up.
 */
export function SearchPage() {
  const { t } = useI18n();
  const locations = useLocations();
  const [draft, setDraft] = useState('');
  const [params, setParams] = useState<{
    q: string;
    kind?: 'reservation' | 'rental';
    locationCode?: string;
  }>({ q: '' });

  const search = useOpsSearch(params);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setParams((p) => ({ ...p, q: draft.trim() }));
  }

  const money = (m: number | null, c: string | null) =>
    m == null || !c ? '—' : `${(m / 100).toFixed(2)} ${c}`;

  const columns: Array<DataTableColumn<SearchHit>> = [
    {
      key: 'kind',
      header: t('ops.search.kind'),
      cell: (h) => (
        <div className="flex flex-col gap-1">
          <Badge variant={h.kind === 'rental' ? 'success' : 'neutral'}>
            {h.kind === 'rental' ? t('ops.search.rental') : t('ops.search.reservation')}
          </Badge>
          {h.overdue ? <Badge variant="destructive">{t('ops.search.overdue')}</Badge> : null}
        </div>
      ),
    },
    {
      key: 'reference',
      header: t('ops.search.reference'),
      cell: (h) => (
        <div className="font-mono text-xs">
          <Link className="text-primary underline-offset-2 hover:underline" to={h.href}>
            {h.reference}
          </Link>
          {h.reservationReference ? (
            <div className="text-muted-foreground">← {h.reservationReference}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('ops.tbl.status'),
      cell: (h) => <Badge variant="neutral">{h.status}</Badge>,
    },
    { key: 'driver', header: t('ops.search.driver'), cell: (h) => h.driverName ?? '—' },
    {
      key: 'vehicle',
      header: t('ops.search.vehicle'),
      cell: (h) => (
        <span className="text-xs">
          {h.categoryCode ?? '—'}
          {h.plate ? ` · ${h.plate}` : ''}
        </span>
      ),
    },
    {
      key: 'window',
      header: t('ops.search.window'),
      cell: (h) => (
        <span className="text-xs text-muted-foreground">
          {new Date(h.pickupAt).toLocaleDateString()} → {new Date(h.returnAt).toLocaleDateString()}
          <br />
          {h.locationCode}
          {h.returnLocationCode !== h.locationCode ? ` → ${h.returnLocationCode}` : ''}
        </span>
      ),
    },
    { key: 'total', header: t('ops.search.total'), cell: (h) => money(h.totalMinor, h.currency) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.search.title')} description={t('ops.search.subtitle')} />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_10rem_12rem_auto]">
            <Field label={t('ops.search.queryLabel')} htmlFor="ops-search-q">
              {({ id }) => (
                <Input
                  id={id}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('ops.search.queryHint')}
                  data-testid="ops-search-q"
                />
              )}
            </Field>
            <Field label={t('ops.search.kind')} htmlFor="ops-search-kind">
              {({ id }) => (
                <select
                  id={id}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={params.kind ?? ''}
                  onChange={(e) =>
                    setParams((p) => ({
                      ...p,
                      kind: (e.target.value || undefined) as 'reservation' | 'rental' | undefined,
                    }))
                  }
                  data-testid="ops-search-kind"
                >
                  <option value="">{t('ops.search.anyKind')}</option>
                  <option value="reservation">{t('ops.search.reservation')}</option>
                  <option value="rental">{t('ops.search.rental')}</option>
                </select>
              )}
            </Field>
            <Field label={t('ops.search.location')} htmlFor="ops-search-loc">
              {({ id }) => (
                <select
                  id={id}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={params.locationCode ?? ''}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, locationCode: e.target.value || undefined }))
                  }
                >
                  <option value="">{t('ops.search.anyLocation')}</option>
                  {(locations.data ?? []).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div className="flex items-end">
              <Button type="submit" data-testid="ops-search-go">
                {t('action.search')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            rows={search.data?.results}
            rowKey={(h) => `${h.kind}:${h.reference}`}
            isLoading={search.isLoading && search.isFetching}
            isError={search.isError}
            onRetry={() => search.refetch()}
            rowProps={(h) => ({ 'data-kind': h.kind, 'data-ref': h.reference })}
            testid="ops-search-results"
            bodyTestid="ops-search-rows"
            minWidth="52rem"
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.search.loadFail'),
              retry: t('ops.st.retry'),
              empty:
                params.q || params.locationCode ? t('ops.search.noHits') : t('ops.search.start'),
            }}
          />
          {search.data ? (
            <p className="mt-2 text-xs text-muted-foreground" data-testid="ops-search-count">
              {t('ops.search.count', { n: search.data.count })}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
