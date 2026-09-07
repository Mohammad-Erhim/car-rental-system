import {
  AppStateView,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@carrental/ui';
import { useState } from 'react';

import { useOpsUnits } from '../../lib/ops-discovery-hooks.js';

/**
 * SCREEN-OPS-013 — Fleet inventory (read this stage). Units by location + category + state; VIN
 * and plate are bidi-isolated. Transfers / maintenance / inspections are delivered in STAGE-005.
 */
export function FleetInventoryPage() {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Fleet inventory</h1>
        <p className="text-sm text-muted-foreground">
          Every vehicle unit, its category, current location and state.
        </p>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Units</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Filter by location code"
              aria-label="Filter by location code"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value.toUpperCase())}
              className="max-w-[14rem]"
            />
            <Input
              placeholder="Filter by category code"
              aria-label="Filter by category code"
              value={categoryCode}
              onChange={(e) => setCategoryCode(e.target.value.toLowerCase())}
              className="max-w-[14rem]"
            />
          </div>
        </CardHeader>
        <CardContent>
          {units.isLoading ? (
            <AppStateView kind="loading" inline title="Loading…" />
          ) : units.isError ? (
            <AppStateView
              kind="failure"
              inline
              title="Couldn't load the fleet"
              primaryAction={{ label: 'Retry', onClick: () => units.refetch() }}
            />
          ) : !units.data?.length ? (
            <AppStateView kind="no-results" inline title="No units match those filters" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm" data-testid="fleet-table">
                <thead className="text-start text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-1 text-start font-medium">Plate</th>
                    <th className="py-1 text-start font-medium">VIN</th>
                    <th className="py-1 text-start font-medium">Vehicle</th>
                    <th className="py-1 text-start font-medium">Category</th>
                    <th className="py-1 text-start font-medium">Location</th>
                    <th className="py-1 text-start font-medium">State</th>
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
