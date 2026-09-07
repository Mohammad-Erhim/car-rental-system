import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  PageHeader,
} from '@carrental/ui';
import { useState } from 'react';

import { formatMinor } from '../../lib/discovery-hooks.js';
import { useAssignVehicle } from '../../lib/rental-hooks.js';
import { useOpsReservations } from '../../lib/reservation-hooks.js';

/**
 * SCREEN-OPS-004 — reservation queue. Filter by state / pickup location; read-only list for the
 * agent, with an inline "assign vehicle" action on confirmed rows.
 */
export function ReservationQueuePage() {
  const { t } = useI18n();
  const [state, setState] = useState('');
  const [locationCode, setLocationCode] = useState('');
  const rows = useOpsReservations({
    state: state || undefined,
    locationCode: locationCode || undefined,
  });
  const assign = useAssignVehicle();
  const [assignMsg, setAssignMsg] = useState<string | null>(null);

  const TH = ['reference', 'state', 'channel', 'category', 'pickup', 'total', 'paid'] as const;

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.queue.title')} description={t('ops.queue.subtitle')} />

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">{t('ops.queue.card')}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label={t('ops.queue.filterState')}
              className="flex h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="">{t('ops.queue.allStates')}</option>
              {['pending', 'confirmed', 'cancelled', 'no_show', 'fulfilled'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Input
              placeholder={t('ops.queue.locPlaceholder')}
              aria-label={t('ops.queue.filterLoc')}
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value.toUpperCase())}
              className="max-w-[14rem]"
            />
          </div>
        </CardHeader>
        <CardContent>
          {rows.isLoading ? (
            <AppStateView kind="loading" inline title={t('ops.st.loading')} />
          ) : rows.isError ? (
            <AppStateView
              kind="failure"
              inline
              title={t('ops.queue.loadFail')}
              primaryAction={{ label: t('ops.st.retry'), onClick: () => rows.refetch() }}
            />
          ) : !rows.data?.length ? (
            <AppStateView kind="no-results" inline title={t('ops.queue.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm" data-testid="ops-res-table">
                <thead className="text-start text-xs uppercase text-muted-foreground">
                  <tr>
                    {TH.map((k) => (
                      <th key={k} className="py-1 text-start font-medium">
                        {t(`ops.tbl.${k}`)}
                      </th>
                    ))}
                    <th className="py-1"></th>
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
                      <td className="py-2 text-end">
                        {r.state === 'confirmed' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={assign.isPending}
                            data-testid={`assign-${r.reference}`}
                            onClick={async () => {
                              setAssignMsg(null);
                              try {
                                await assign.mutateAsync(r.reference);
                                setAssignMsg(t('ops.queue.assigned', { ref: r.reference }));
                              } catch {
                                setAssignMsg(t('ops.queue.assignFail', { ref: r.reference }));
                              }
                            }}
                          >
                            {t('ops.queue.assign')}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {assignMsg ? (
            <p className="mt-2 text-sm text-muted-foreground" data-testid="assign-msg">
              {assignMsg}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
