import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  Input,
  PageHeader,
  Toolbar,
  type DataTableColumn,
} from '@carrental/ui';
import { useState } from 'react';

import { useOpsUnits } from '../../lib/ops-discovery-hooks.js';

type Unit = NonNullable<ReturnType<typeof useOpsUnits>['data']>[number];

/**
 * SCREEN-OPS-013 — Fleet inventory (read this stage). Units by location + category + state; VIN
 * and plate are bidi-isolated.
 */
export function FleetInventoryPage() {
  const { t } = useI18n();
  const [locationCode, setLocationCode] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const units = useOpsUnits({
    locationCode: locationCode || undefined,
    categoryCode: categoryCode || undefined,
  });

  const stateVariant = (s: string) =>
    s === 'available'
      ? 'success'
      : s === 'maintenance' || s === 'out_of_service'
        ? 'warning'
        : 'neutral';

  const columns: Array<DataTableColumn<Unit>> = [
    {
      key: 'plate',
      header: t('ops.tbl.plate'),
      cell: (u) => u.plate,
      className: 'bidi-isolate font-mono text-xs',
    },
    {
      key: 'vin',
      header: t('ops.tbl.vin'),
      cell: (u) => u.vin,
      className: 'bidi-isolate font-mono text-xs',
    },
    {
      key: 'vehicle',
      header: t('ops.tbl.vehicle'),
      cell: (u) =>
        [u.year, u.make, u.model].filter(Boolean).join(' ') + (u.colour ? ` · ${u.colour}` : ''),
    },
    { key: 'category', header: t('ops.tbl.category'), cell: (u) => u.categoryName },
    { key: 'location', header: t('ops.tbl.location'), cell: (u) => u.currentLocationCode },
    {
      key: 'state',
      header: t('ops.tbl.state'),
      cell: (u) => <Badge variant={stateVariant(u.state)}>{u.state.replace('_', ' ')}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.fleet.title')} description={t('ops.fleet.subtitle')} />

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">{t('ops.fleet.card')}</CardTitle>
          <Toolbar aria-label={t('ops.fleet.card')}>
            <Input
              placeholder={t('ops.fleet.filterLoc')}
              aria-label={t('ops.fleet.filterLoc')}
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value.toUpperCase())}
              className="max-w-[14rem]"
            />
            <Input
              placeholder={t('ops.fleet.filterCat')}
              aria-label={t('ops.fleet.filterCat')}
              value={categoryCode}
              onChange={(e) => setCategoryCode(e.target.value.toLowerCase())}
              className="max-w-[14rem]"
            />
          </Toolbar>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={units.data}
            rowKey={(u) => u.id}
            isLoading={units.isLoading}
            isError={units.isError}
            onRetry={() => units.refetch()}
            rowProps={(u) => ({ 'data-plate': u.plate })}
            testid="fleet-table"
            bodyTestid="fleet-rows"
            labels={{
              loading: t('ops.st.loading'),
              loadFailTitle: t('ops.fleet.loadFail'),
              retry: t('ops.st.retry'),
              empty: t('ops.fleet.empty'),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
