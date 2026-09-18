import { useI18n } from '@carrental/i18n/react';
import { CarFront, Fuel, Gauge, ReceiptText } from 'lucide-react';

import { DetailList } from '@/components/detail-list';
import { SectionCard } from '@/components/section-card';
import { StateView } from '@/components/state-view';
import { Separator } from '@/components/ui/separator';
import type { RentalDetail } from '@/lib/rental-hooks';
import { cn } from '@/lib/utils';

/** Who, what and when — the static facts of the hire. */
export function RentalSummaryCard({ d }: { d: RentalDetail }) {
  const { t, fmt } = useI18n();
  const notYet = t('ops.rentd.notYet');
  return (
    <SectionCard title={t('ops.rentd.rental')} icon={CarFront}>
      <DetailList
        items={[
          {
            term: t('ops.rentd.vehicle'),
            detail: (
              <span>
                <span className="bidi-isolate">{d.vehicle ?? t('ops.rent.noVehicle')}</span>
                {d.plate ? (
                  <span className="bidi-isolate ms-2 font-mono text-xs font-normal text-muted-foreground">
                    {d.plate}
                  </span>
                ) : null}
              </span>
            ),
          },
          { term: t('ops.rentd.customer'), detail: d.customerName ?? '—' },
          { term: t('ops.search.driver'), detail: d.driverName ?? '—' },
          {
            term: t('ops.rentd.window'),
            detail: `${fmt.dateTime(d.scheduledPickupAt)} – ${fmt.dateTime(d.scheduledReturnAt)}`,
          },
          {
            term: t('ops.resv.locations'),
            detail: (
              <span className="bidi-isolate">
                {d.pickupLocationCode === d.returnLocationCode
                  ? d.pickupLocationCode
                  : `${d.pickupLocationCode} → ${d.returnLocationCode}`}
              </span>
            ),
          },
          {
            term: t('ops.rentd.agreement'),
            detail: d.agreementVersion
              ? t('ops.rentd.agreementV', { v: d.agreementVersion })
              : t('ops.rentd.noAgreement'),
          },
          {
            term: t('ops.rentd.pickedUp'),
            detail: d.pickedUpAt ? fmt.dateTime(d.pickedUpAt) : notYet,
          },
          {
            term: t('ops.rentd.returned'),
            detail: d.returnedAt ? fmt.dateTime(d.returnedAt) : notYet,
          },
        ]}
      />
    </SectionCard>
  );
}

function Meter({
  icon: Icon,
  label,
  out,
  inn,
  unit,
  percent,
  delta,
}: {
  icon: typeof Gauge;
  label: string;
  out: number | null;
  inn: number | null;
  unit: string;
  /** render a fill bar for the "in" value against 100 */
  percent?: boolean;
  delta?: string;
}) {
  const { fmt } = useI18n();
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </p>
      {out == null ? (
        <p className="text-lg font-semibold">—</p>
      ) : (
        <p className="bidi-isolate flex flex-wrap items-baseline gap-x-2 tabular-nums">
          <span className="text-lg font-semibold">
            {fmt.number(out)}
            {unit}
          </span>
          <span className="text-muted-foreground" aria-hidden="true">
            →
          </span>
          <span className={cn('text-lg font-semibold', inn == null && 'text-muted-foreground')}>
            {inn == null ? '—' : `${fmt.number(inn)}${unit}`}
          </span>
        </p>
      )}
      {percent && inn != null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(inn, 100)}%` }}
          />
        </div>
      ) : null}
      {delta ? <p className="text-xs text-muted-foreground">{delta}</p> : null}
    </div>
  );
}

/** Odometer and fuel, handed out vs. handed back. */
export function ConditionCard({ d }: { d: RentalDetail }) {
  const { t, fmt } = useI18n();
  const km =
    d.odometerOutKm != null && d.odometerInKm != null ? d.odometerInKm - d.odometerOutKm : null;
  const fuelLost = d.fuelOutPct != null && d.fuelInPct != null ? d.fuelOutPct - d.fuelInPct : null;
  return (
    <SectionCard title={t('ops.rentd.condition')} icon={Gauge}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Meter
          icon={Gauge}
          label={t('ops.rentd.odometer')}
          out={d.odometerOutKm}
          inn={d.odometerInKm}
          unit=" km"
          delta={
            km != null
              ? t('ops.rent.returnOdoDelta', { km: fmt.number(km) }).replace(/^ · /, '')
              : undefined
          }
        />
        <Meter
          icon={Fuel}
          label={t('ops.rentd.fuel')}
          out={d.fuelOutPct}
          inn={d.fuelInPct}
          unit="%"
          percent
          delta={
            fuelLost != null && fuelLost > 0
              ? t('ops.rent.returnFuelLine', {
                  inPct: d.fuelInPct ?? '',
                  outPct: d.fuelOutPct ?? '',
                  deficit: fuelLost,
                })
              : undefined
          }
        />
      </div>
    </SectionCard>
  );
}

/** The settlement total and the inspection findings behind it. */
export function SettlementCard({
  d,
  money,
}: {
  d: RentalDetail;
  money: (minor: number) => string;
}) {
  const { t } = useI18n();
  return (
    <SectionCard title={t('ops.rentd.settlement')} icon={ReceiptText} contentClassName="space-y-3">
      <div className="flex items-center justify-between gap-4 text-base font-semibold">
        <span>{t('ops.rentd.total')}</span>
        <span className="tabular-nums">{money(d.settlementMinor)}</span>
      </div>
      <Separator />
      {d.findings.length ? (
        <ul className="space-y-3">
          {d.findings.map((f, i) => (
            <li key={i} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{f.area}</span>
                <span className="text-muted-foreground"> · {f.severity}</span>
                <span className="block text-xs text-muted-foreground">{f.description}</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">{money(f.chargeMinor)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <StateView title={t('ops.rentd.noFindings')} className="py-2" />
      )}
    </SectionCard>
  );
}
