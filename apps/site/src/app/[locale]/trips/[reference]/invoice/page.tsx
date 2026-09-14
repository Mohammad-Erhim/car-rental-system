'use client';

import { useI18n } from '@carrental/i18n/react';
import { AppStateView, Button } from '@carrental/ui';
import { ArrowLeft, Printer } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { RequireAuth } from '../../../../../components/require-auth';
import {
  formatMinor,
  useReservationInvoices,
  type InvoiceView,
} from '../../../../../lib/customer-hooks';
import { useLocale } from '../../../../../lib/nav';

/** SCREEN-CUS-019b — the formal invoice (FR-PAY): the organization's legal identity, an
 *  org-sequential invoice number, and — for a credit note — which invoice it corrects. Distinct
 *  from the lightweight printable receipt: this is the document with the legal fields on it. */
function Invoice() {
  const { t, locale: uiLocale } = useI18n();
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  const reference =
    (Array.isArray(params.reference) ? params.reference[0] : params.reference) ?? '';

  const invoices = useReservationInvoices(reference);
  const requested = search.get('number');
  const list = invoices.data ?? [];
  const current: InvoiceView | undefined = requested
    ? list.find((i) => i.number === requested)
    : list[list.length - 1];

  const dt = (iso: string) =>
    new Date(iso).toLocaleDateString(uiLocale, { year: 'numeric', month: 'long', day: 'numeric' });

  if (invoices.isLoading) return <AppStateView kind="loading" title={t('state.loading.title')} />;
  if (invoices.isError) {
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
  if (!current) {
    return (
      <AppStateView
        kind="empty"
        title={t('invoice.notYetIssued')}
        description={t('invoice.notYetIssuedHint')}
        primaryAction={{
          label: t('receipt.backToTrip'),
          onClick: () => router.push(`/${locale}/trips/${reference}`),
        }}
      />
    );
  }

  const { org, customer, trip, lines } = current.snapshot;
  const address = org.registeredAddress;
  const addressLine = [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    address.countryCode,
  ]
    .filter(Boolean)
    .join(', ');
  const isCredit = current.kind === 'credit_note';

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
        <Button onClick={() => window.print()} data-testid="invoice-print">
          <Printer className="me-1.5 size-4" aria-hidden="true" />
          {t('receipt.print')}
        </Button>
      </div>

      <div className="surface-card space-y-6 rounded-2xl p-6 print:rounded-none print:border-0 print:shadow-none sm:p-8">
        <div className="flex items-start justify-between gap-4 border-b border-hairline pb-4">
          <div>
            <p className="text-lg font-bold text-ink">{org.legalName}</p>
            <p className="whitespace-pre-line text-xs text-ink-muted">{addressLine}</p>
            <p className="text-xs text-ink-muted">{t('invoice.taxId', { id: org.taxId })}</p>
          </div>
          <div className="text-end text-xs text-ink-muted">
            <p className="text-sm font-semibold text-ink">
              {isCredit ? t('invoice.creditNoteTitle') : t('invoice.title')}
            </p>
            <p className="bidi-isolate font-mono">{current.number}</p>
            <p>{dt(current.issuedAt)}</p>
          </div>
        </div>

        {isCredit && current.previousNumber ? (
          <p className="text-sm text-ink-muted" data-testid="invoice-corrects">
            {t('invoice.correctsInvoice', { number: current.previousNumber })}
          </p>
        ) : null}

        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">{t('invoice.billedTo')}</p>
          <p className="font-medium text-ink">{customer.fullName ?? '—'}</p>
          {customer.email ? <p className="text-sm text-ink-muted">{customer.email}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {t('receipt.vehicleClass')}
            </p>
            <p className="font-medium text-ink">{trip.categoryCode}</p>
            {trip.pickedUnit ? (
              <p className="text-xs text-ink-muted">
                {[trip.pickedUnit.make, trip.pickedUnit.model].filter(Boolean).join(' ')}
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">{t('receipt.dates')}</p>
            <p className="font-medium text-ink">
              {dt(trip.pickupAt)} – {dt(trip.returnAt)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {t('receipt.pickupLoc')}
            </p>
            <p className="font-medium text-ink">{trip.pickupLocationCode}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {t('receipt.returnLoc')}
            </p>
            <p className="font-medium text-ink">{trip.returnLocationCode}</p>
          </div>
        </div>

        <dl className="space-y-2 border-t border-hairline pt-4 text-sm" data-testid="invoice-lines">
          {lines.map((l, i) => (
            <div key={`${l.code}-${i}`} className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted">
                {l.label}
                {l.quantity > 1 ? ` × ${l.quantity}` : ''}
              </dt>
              <dd className="text-ink">{formatMinor(l.amountMinor, current.currency, uiLocale)}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2 text-base font-bold text-ink">
            <dt>{t('receipt.total')}</dt>
            <dd data-testid="invoice-total">
              {formatMinor(current.totalMinor, current.currency, uiLocale)}
            </dd>
          </div>
        </dl>

        <p className="text-xs text-ink-muted">{t('invoice.footerNote')}</p>
      </div>

      {list.length > 1 ? (
        <div className="surface-card space-y-2 rounded-2xl p-4 text-sm print:hidden">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t('invoice.allVersions')}
          </p>
          {list.map((inv) => (
            <button
              key={inv.number}
              type="button"
              onClick={() =>
                router.push(`/${locale}/trips/${reference}/invoice?number=${inv.number}`)
              }
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start transition-colors ${
                inv.number === current.number ? 'bg-brand/10 text-brand' : 'hover:bg-surface-muted'
              }`}
            >
              <span className="bidi-isolate font-mono">{inv.number}</span>
              <span>{formatMinor(inv.totalMinor, inv.currency, uiLocale)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function InvoicePage() {
  return (
    <RequireAuth>
      <Invoice />
    </RequireAuth>
  );
}
