import { useI18n } from '@carrental/i18n/react';
import { CalendarDays, CreditCard, FileText, ReceiptText, Users } from 'lucide-react';

import { DetailList } from '@/components/detail-list';
import { SectionCard } from '@/components/section-card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { InvoiceView } from '@/lib/invoice-hooks';
import type { ReservationDetail } from '@/lib/reservation-hooks';
import { cn } from '@/lib/utils';

type Money = (minor: number) => string;

const humanise = (code: string) => code.replace(/_/g, ' ');

/** The booking window: when, where, what. */
export function BookingSummaryCard({ d }: { d: ReservationDetail }) {
  const { t, fmt } = useI18n();
  return (
    <SectionCard title={t('ops.resv.summary')} icon={CalendarDays}>
      <DetailList
        items={[
          { term: t('ops.resv.pickup'), detail: fmt.dateTime(d.pickupAt) },
          { term: t('ops.resv.return'), detail: fmt.dateTime(d.returnAt) },
          { term: t('ops.resv.duration'), detail: t('ops.resv.hours', { n: d.durationHours }) },
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
          { term: t('ops.tbl.category'), detail: d.categoryCode },
          { term: t('ops.tbl.channel'), detail: <span className="capitalize">{d.channel}</span> },
        ]}
      />
    </SectionCard>
  );
}

/** What the customer is being charged for, line by line. */
export function LineItemsCard({ d, money }: { d: ReservationDetail; money: Money }) {
  const { t } = useI18n();
  if (!d.lines.length) return null;
  return (
    <SectionCard title={t('ops.resv.lineItems')} icon={ReceiptText}>
      <ul className="divide-y">
        {d.lines.map((l, i) => (
          <li
            key={`${l.code}-${i}`}
            className="flex items-baseline justify-between gap-4 py-3 text-sm first:pt-0 last:pb-0"
          >
            <span className="min-w-0">
              <span className="font-medium">{l.label}</span>
              {l.quantity > 1 ? (
                <span className="ms-1.5 text-muted-foreground">
                  × {l.quantity} @ {money(l.unitMinor)}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 font-medium tabular-nums">{money(l.amountMinor)}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function InvoicesCard({ invoices, money }: { invoices: InvoiceView[]; money: Money }) {
  const { t, fmt } = useI18n();
  if (!invoices.length) return null;
  return (
    <SectionCard title={t('ops.resv.invoices')} icon={FileText}>
      <ul className="divide-y" data-testid="ops-resv-invoices">
        {invoices.map((inv) => (
          <li
            key={inv.number}
            data-testid={`ops-invoice-${inv.number}`}
            className="flex items-center justify-between gap-4 py-3 text-sm first:pt-0 last:pb-0"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="flex flex-wrap items-center gap-2">
                <span className="bidi-isolate font-mono font-medium">{inv.number}</span>
                {inv.kind === 'credit_note' ? (
                  <Badge variant="secondary">{t('ops.resv.creditNote')}</Badge>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">{fmt.dateTime(inv.issuedAt)}</p>
            </div>
            <span className="shrink-0 font-medium tabular-nums">{money(inv.totalMinor)}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 text-sm',
        strong && 'text-base font-semibold',
      )}
    >
      <span className={strong ? undefined : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Totals, what has been paid / refunded, and any balance still due. */
export function ChargesCard({ d, money }: { d: ReservationDetail; money: Money }) {
  const { t } = useI18n();
  const due = d.totalMinor - d.paidMinor;
  return (
    <SectionCard title={t('ops.resv.charges')} icon={CreditCard} contentClassName="space-y-2.5">
      <Line label={t('ops.resv.subtotal')} value={money(d.subtotalMinor)} />
      <Line label={t('ops.resv.tax')} value={money(d.taxMinor)} />
      <Separator />
      <Line strong label={t('ops.tbl.total')} value={money(d.totalMinor)} />
      <Line label={t('ops.tbl.paid')} value={money(d.paidMinor)} />
      {d.refundedMinor > 0 ? (
        <Line label={t('ops.resv.refunded')} value={money(d.refundedMinor)} />
      ) : null}
      {due > 0 && d.state !== 'cancelled' && d.state !== 'no_show' ? (
        <p className="mt-1 rounded-lg bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
          {t('ops.resv.balanceDue', { amount: money(due) })}
        </p>
      ) : null}
    </SectionCard>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (
      (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')
    ).toUpperCase() || '?'
  );
}

export function DriversCard({ drivers }: { drivers: ReservationDetail['drivers'] }) {
  const { t } = useI18n();
  return (
    <SectionCard title={t('ops.resv.drivers')} icon={Users}>
      {drivers.length ? (
        <ul className="space-y-3">
          {drivers.map((dr, i) => (
            <li key={i} className="flex items-center gap-3">
              <Avatar className="size-9">
                <AvatarFallback>{initials(dr.fullName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{dr.fullName}</p>
                <p className="truncate text-xs capitalize text-muted-foreground">
                  {humanise(dr.role)}
                  {dr.email ? <span className="normal-case"> · {dr.email}</span> : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('ops.resv.noDrivers')}</p>
      )}
    </SectionCard>
  );
}
