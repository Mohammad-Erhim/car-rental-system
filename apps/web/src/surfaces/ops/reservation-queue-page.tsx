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

import { formatMinor } from '../../lib/discovery-hooks.js';
import { useOpsReservations } from '../../lib/reservation-hooks.js';

/**
 * SCREEN-OPS-004 — reservation queue. Filter by state / pickup location; read-only list for the
 * agent. Detail / modify / cancel-with-override land with the rest of STAGE-004's ops surfaces.
 */
export function ReservationQueuePage() {
  const [state, setState] = useState('');
  const [locationCode, setLocationCode] = useState('');
  const rows = useOpsReservations({
    state: state || undefined,
    locationCode: locationCode || undefined,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Reservations</h1>
        <p className="text-sm text-muted-foreground">Upcoming and recent reservations by pickup.</p>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Queue</CardTitle>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Filter by state"
              className="flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="">All states</option>
              {['pending', 'confirmed', 'cancelled', 'no_show', 'fulfilled'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Input
              placeholder="Pickup location code"
              aria-label="Filter by pickup location code"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value.toUpperCase())}
              className="max-w-[14rem]"
            />
          </div>
        </CardHeader>
        <CardContent>
          {rows.isLoading ? (
            <AppStateView kind="loading" inline title="Loading…" />
          ) : rows.isError ? (
            <AppStateView
              kind="failure"
              inline
              title="Couldn't load reservations"
              primaryAction={{ label: 'Retry', onClick: () => rows.refetch() }}
            />
          ) : !rows.data?.length ? (
            <AppStateView kind="no-results" inline title="No reservations match those filters" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm" data-testid="ops-res-table">
                <thead className="text-start text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-1 text-start font-medium">Reference</th>
                    <th className="py-1 text-start font-medium">State</th>
                    <th className="py-1 text-start font-medium">Channel</th>
                    <th className="py-1 text-start font-medium">Category</th>
                    <th className="py-1 text-start font-medium">Pickup</th>
                    <th className="py-1 text-start font-medium">Total</th>
                    <th className="py-1 text-start font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody data-testid="ops-res-rows">
                  {rows.data.map((r) => (
                    <tr key={r.reference} className="border-t" data-ref={r.reference}>
                      <td className="bidi-isolate py-2 pe-2 font-mono text-xs">{r.reference}</td>
                      <td className="py-2 pe-2">
                        <Badge
                          variant={
                            r.state === 'confirmed'
                              ? 'success'
                              : r.state === 'cancelled'
                                ? 'neutral'
                                : 'warning'
                          }
                        >
                          {r.state}
                        </Badge>
                      </td>
                      <td className="py-2 pe-2">{r.channel}</td>
                      <td className="py-2 pe-2">{r.categoryCode}</td>
                      <td className="py-2 pe-2">{new Date(r.pickupAt).toLocaleString()}</td>
                      <td className="py-2 pe-2">{formatMinor(r.totalMinor, r.currency)}</td>
                      <td className="py-2 pe-2">{formatMinor(r.paidMinor, r.currency)}</td>
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
