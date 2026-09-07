import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  PageHeader,
} from '@carrental/ui';
import { useState } from 'react';

import { useOpsUnits } from '../../lib/ops-discovery-hooks.js';

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

  const TH = ['plate', 'vin', 'vehicle', 'category', 'location', 'state'] as const;

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.fleet.title')} description={t('ops.fleet.subtitle')} />

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">{t('ops.fleet.card')}</CardTitle>
          <div className="flex flex-wrap gap-2">
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
          </div>
        </CardHeader>
        <CardContent>
          {units.isLoading ? (
            <AppStateView kind="loading" inline title={t('ops.st.loading')} />
          ) : units.isError ? (
            <AppStateView
              kind="failure"
              inline
              title={t('ops.fleet.loadFail')}
              primaryAction={{ label: t('ops.st.retry'), onClick: () => units.refetch() }}
            />
          ) : !units.data?.length ? (
            <AppStateView kind="no-results" inline title={t('ops.fleet.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm" data-testid="fleet-table">
                <thead className="text-start text-xs uppercase text-muted-foreground">
                  <tr>
                    {TH.map((k) => (
                      <th key={k} className="py-1 text-start font-medium">
                        {t(`ops.tbl.${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody data-testid="fleet-rows">
                  {units.data.map((u) => (
                    <tr key={u.id} className="border-t" data-plate={u.plate}>
                      <td className="bidi-isolate py-2 pe-2 font-mono text-xs">{u.plate}</td>
                      <td className="bidi-isolate py-2 pe-2 font-mono text-xs">{u.vin}</td>
                      <td className="py-2 pe-2">
                        {[u.year, u.make, u.model].filter(Boolean).join(' ')}
                        {u.colour ? ` · ${u.colour}` : ''}
                      </td>
                      <td className="py-2 pe-2">{u.categoryName}</td>
                      <td className="py-2 pe-2">{u.currentLocationCode}</td>
                      <td className="py-2 pe-2">
                        <Badge variant={stateVariant(u.state)}>{u.state.replace('_', ' ')}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
