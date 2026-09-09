'use client';

import { Badge } from '@carrental/ui';
import { ArrowRight, CalendarClock, Car, MapPin } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { formatMinor } from '../lib/customer-hooks';

export interface ReservationSummary {
  reference: string;
  state: string;
  categoryCode: string;
  pickupLocationCode: string;
  pickupAt: string;
  returnAt: string;
  totalMinor: number;
  currency: string;
}

/**
 * One booking as a card — shared by My trips, Payments & receipts, and the account overview so
 * the row looks the same everywhere. `action` is the link at the end; `amountLabel` optionally
 * captions the price.
 */
export function ReservationCard({
  r,
  uiLocale,
  href,
  actionLabel,
  actionTestid,
  amountLabel,
  badge,
  testid,
}: {
  r: ReservationSummary;
  uiLocale: string;
  href: string;
  actionLabel: string;
  actionTestid?: string;
  amountLabel?: string;
  badge?: ReactNode;
  testid?: string;
}) {
  const dateFmt = new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium' });
  return (
    <div
      className="surface-card flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
      data-testid={testid}
    >
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="bidi-isolate font-mono text-sm font-semibold text-ink">
            {r.reference}
          </span>
          {badge ?? (
            <Badge variant={r.state === 'confirmed' ? 'success' : 'neutral'}>{r.state}</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <Car className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
            {r.categoryCode}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
            {r.pickupLocationCode}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
            {dateFmt.format(new Date(r.pickupAt))} – {dateFmt.format(new Date(r.returnAt))}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-center">
        <div className="text-start sm:text-end">
          {amountLabel ? (
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              {amountLabel}
            </p>
          ) : null}
          <p className="text-lg font-bold text-ink">
            {formatMinor(r.totalMinor, r.currency, uiLocale)}
          </p>
        </div>
        <Link
          href={href}
          data-testid={actionTestid}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-hairline px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-muted"
        >
          {actionLabel}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
