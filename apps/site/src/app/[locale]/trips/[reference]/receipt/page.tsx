'use client';

import { useI18n } from '@carrental/i18n/react';
import { AppStateView, Button } from '@carrental/ui';
import { ArrowLeft, Printer } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';

import { RequireAuth } from '../../../../../components/require-auth';
import { formatMinor, useReservationDetail } from '../../../../../lib/customer-hooks';
import { useLocale } from '../../../../../lib/nav';

/** SCREEN-CUS-019 (receipt) — a printable payment summary for one reservation: line items, tax,
 *  total, amount paid/refunded, and the card used. Not a formal tax invoice (no org address/tax
 *  id fields exist yet — see [[full-codebase-audit]] follow-ups); a clear, printable confirmation
 *  of what was charged, which is what most customers actually need after booking. */
function Receipt() {
  const { t, locale: uiLocale } = useI18n();
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const reference =
    (Array.isArray(params.reference) ? params.reference[0] : params.reference) ?? '';

  const detail = useReservationDetail(reference);
  const r = detail.data;

  const dt = (iso: string) =>
    new Date(iso).toLocaleDateString(uiLocale, { year: 'numeric', month: 'long', day: 'numeric' });

  if (detail.isLoading) return <AppStateView kind="loading" title={t('state.loading.title')} />;
  if (detail.isError || !r) {
    return (
      <AppStateView
        kind="failure"
        title={t('reservation.loadError')}
        primaryAction={{
          label: t('reservation.backToTrips'),
          onClick: () => router.push(`/${locale}/trips`),
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <button
          type="button"
          onClick={() => router.push(`/${locale}/trips/${reference}`)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline underline-offset-4"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t('receipt.backToTrip')}
        </button>
        <Button onClick={() => window.print()} data-testid="receipt-print">
          <Printer className="me-1.5 size-4" aria-hidden="true" />
          {t('receipt.print')}
        </Button>
      </div>

      <div className="surface-card space-y-6 rounded-2xl p-6 print:rounded-none print:border-0 print:shadow-none sm:p-8">
        <div className="flex items-start justify-between gap-4 border-b border-hairline pb-4">
          <div>
            <p className="text-lg font-bold text-ink">{t('app.name')}</p>
            <p className="text-xs text-ink-muted">{t('receipt.title')}</p>
          </div>
          <div className="text-end text-xs text-ink-muted">
            <p className="bidi-isolate font-mono text-sm font-semibold text-ink">{r.reference}</p>
            <p>{dt(r.createdAt)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {t('receipt.vehicleClass')}
            </p>
            <p className="font-medium text-ink">{r.categoryCode}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">{t('receipt.dates')}</p>
            <p className="font-medium text-ink">
              {dt(r.pickupAt)} – {dt(r.returnAt)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {t('receipt.pickupLoc')}
            </p>
            <p className="font-medium text-ink">{r.pickupLocationCode}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {t('receipt.returnLoc')}
            </p>
            <p className="font-medium text-ink">{r.returnLocationCode}</p>
          </div>
        </div>

        <dl className="space-y-2 border-t border-hairline pt-4 text-sm" data-testid="receipt-lines">
          {r.lines.map((l) => (
            <div key={l.code} className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted">
                {l.label}
                {l.quantity > 1 ? ` × ${l.quantity}` : ''}
              </dt>
              <dd className="text-ink">{formatMinor(l.amountMinor, r.currency, uiLocale)}</dd>
            </div>
          ))}
          {/* `r.lines` already itemizes tax as its own row (booking.service.ts always inserts a
              `kind: 'tax'` line) — showing subtotal/tax again here would double it up visually. */}
          <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2 text-base font-bold text-ink">
            <dt>{t('receipt.total')}</dt>
            <dd data-testid="receipt-total">{formatMinor(r.totalMinor, r.currency, uiLocale)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 text-ink-muted">
            <dt>{t('receipt.paid')}</dt>
            <dd>{formatMinor(r.paidMinor, r.currency, uiLocale)}</dd>
          </div>
          {r.refundedMinor > 0 ? (
            <div className="flex items-center justify-between gap-3 text-ink-muted">
              <dt>{t('receipt.refunded')}</dt>
              <dd>−{formatMinor(r.refundedMinor, r.currency, uiLocale)}</dd>
            </div>
          ) : null}
        </dl>

        {r.paymentBrand && r.paymentLast4 ? (
          <p className="border-t border-hairline pt-4 text-xs text-ink-muted">
            {t('receipt.paidWith', {
              brand: r.paymentBrand,
              last4: r.paymentLast4,
            })}
          </p>
        ) : null}

        <p className="text-xs text-ink-muted">{t('receipt.footerNote')}</p>
      </div>
    </div>
  );
}

export default function ReceiptPage() {
  return (
    <RequireAuth>
      <Receipt />
    </RequireAuth>
  );
}
