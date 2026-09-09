'use client';

import { ApiError } from '@carrental/client';
import { useI18n } from '@carrental/i18n/react';
import { AppStateView, Button } from '@carrental/ui';
import { ArrowRight, CalendarClock, Clock, MapPin, Pencil, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { formatMinor, useAvailabilitySearch, useCreateQuote } from '../lib/customer-hooks';
import { useLocale } from '../lib/nav';
import { defaultWindow, isCompleteTrip, readTrip, writeTrip, type TripWindow } from '../lib/trip';

import { HomeSearch, type LocationOption } from './home-search';

/**
 * SCREEN-CUS-003 — the priced "reserve" island on the vehicle page. It takes the pickup window
 * from (in order) the URL query, the visitor's last planned trip, or — failing both — an inline
 * picker right here, so browsing straight to a car never dead-ends on "search first".
 */
function ReserveInner({
  categoryCode,
  locations,
}: {
  categoryCode: string;
  locations: LocationOption[];
}) {
  const { t, locale: uiLocale } = useI18n();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const createQuote = useCreateQuote();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [stored, setStored] = useState<TripWindow | null>(null);

  // localStorage is client-only — read it after mount (this island renders behind a Suspense
  // boundary, so the first paint is the picker either way).
  useEffect(() => setStored(readTrip()), []);

  const fromUrl: Partial<TripWindow> = {
    pickup: params.get('pickup') ?? undefined,
    pickupAt: params.get('pickupAt') ?? undefined,
    returnAt: params.get('returnAt') ?? undefined,
  };
  const trip: TripWindow | null = isCompleteTrip(fromUrl) ? fromUrl : stored;
  const hasWindow = isCompleteTrip(trip);

  const search = useAvailabilitySearch(
    hasWindow
      ? {
          pickupLocationCode: trip.pickup,
          pickupAt: trip.pickupAt,
          returnAt: trip.returnAt,
          categoryCode,
        }
      : null,
  );
  const option = search.data?.options.find((o) => o.categoryCode === categoryCode) ?? null;

  function tripQuery(w: TripWindow): string {
    return new URLSearchParams({
      pickup: w.pickup,
      pickupAt: w.pickupAt,
      returnAt: w.returnAt,
    }).toString();
  }

  function applyTrip(next: TripWindow) {
    writeTrip(next);
    setStored(next);
    setEditing(false);
    setError(null);
    router.replace(`${pathname}?${tripQuery(next)}`, { scroll: false });
  }

  async function reserve() {
    if (!hasWindow) return;
    setError(null);
    try {
      const q = await createQuote.mutateAsync({
        pickupLocationCode: trip.pickup,
        pickupAt: trip.pickupAt,
        returnAt: trip.returnAt,
        categoryCode,
        hold: true,
        holderKey: `site-${Date.now()}`,
      });
      router.push(`/${locale}/checkout?quote=${q.reference}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('checkout.genericError'));
    }
  }

  const header = (
    <div className="flex items-start justify-between gap-3">
      <h2 className="inline-flex items-center gap-2.5 text-lg font-semibold text-ink">
        <span className="icon-chip size-9 rounded-lg" aria-hidden="true">
          <Wallet className="size-5" />
        </span>
        {t('site.vehicle.priceForTrip')}
      </h2>
      {hasWindow && !editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          data-testid="trip-change"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-brand transition-colors hover:bg-brand/10"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          {t('site.vehicle.changeTrip')}
        </button>
      ) : null}
    </div>
  );

  if (!hasWindow || editing) {
    const seed = trip ?? { pickup: '', ...defaultWindow() };
    return (
      <div className="space-y-4">
        {header}
        <p className="text-sm text-ink-muted">{t('site.vehicle.pickTripPrompt')}</p>
        <HomeSearch
          locale={locale}
          locations={locations}
          initialPickup={seed.pickup}
          initialPickupAt={seed.pickupAt}
          initialReturnAt={seed.returnAt}
          onSubmit={applyTrip}
          submitLabel={t('site.vehicle.checkAvailability')}
          testid="vehicle-trip"
        />
        {editing ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            {t('action.cancel')}
          </button>
        ) : null}
      </div>
    );
  }

  const dateFmt = new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium', timeStyle: 'short' });
  const locationName = locations.find((l) => l.code === trip.pickup)?.name ?? trip.pickup;
  const durationHours = Math.max(
    1,
    Math.round((new Date(trip.returnAt).getTime() - new Date(trip.pickupAt).getTime()) / 3.6e6),
  );

  return (
    <div className="space-y-4">
      {header}

      <dl
        className="space-y-2 rounded-xl bg-surface-muted p-3.5 text-sm text-ink-muted"
        data-testid="trip-summary"
      >
        <div className="flex items-center gap-2">
          <MapPin className="size-4 shrink-0 text-brand" aria-hidden="true" />
          <dd className="font-medium text-ink">{locationName}</dd>
        </div>
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 shrink-0 text-brand" aria-hidden="true" />
          <dd>
            {dateFmt.format(new Date(trip.pickupAt))} → {dateFmt.format(new Date(trip.returnAt))}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="size-4 shrink-0 text-brand" aria-hidden="true" />
          <dd>{t('reservation.hours', { hours: durationHours })}</dd>
        </div>
      </dl>

      {search.isLoading ? (
        <AppStateView kind="loading" inline title={t('state.loading.title')} />
      ) : !option || option.fromTotalMinor == null ? (
        <AppStateView
          kind="no-results"
          inline
          title={t('site.vehicle.noPrice')}
          primaryAction={{
            label: t('site.vehicle.seeAvailable'),
            onClick: () => router.push(`/${locale}/search?${tripQuery(trip)}`),
          }}
        />
      ) : (
        <>
          <div className="flex items-end justify-between gap-3 border-t border-hairline pt-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {t('site.vehicle.estTotal')}
              </p>
              <p
                className="text-3xl font-extrabold tracking-tight text-ink"
                data-testid="detail-total"
              >
                {formatMinor(option.fromTotalMinor, option.currency ?? 'USD', uiLocale)}
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                option.bookableCount > 0
                  ? 'bg-brand/10 text-brand'
                  : 'bg-surface-muted text-ink-muted'
              }`}
              data-testid="detail-availability"
            >
              {t('site.search.available', { n: option.bookableCount })}
            </span>
          </div>

          {error ? (
            <p className="text-sm font-medium text-destructive" data-testid="reserve-error">
              {error}
            </p>
          ) : null}

          <Button
            size="lg"
            className="w-full"
            onClick={reserve}
            loading={createQuote.isPending}
            disabled={option.bookableCount < 1}
            data-testid="reserve-button"
          >
            {t('site.vehicle.reserveContinue')}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
          </Button>

          {option.bookableCount < 1 ? (
            <Link
              href={`/${locale}/search?${tripQuery(trip)}`}
              className="block text-center text-sm font-medium text-brand underline underline-offset-4"
            >
              {t('site.vehicle.seeAvailable')}
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}

export function VehicleReserve({
  categoryCode,
  locations,
}: {
  categoryCode: string;
  locations: LocationOption[];
}) {
  return (
    <Suspense fallback={null}>
      <ReserveInner categoryCode={categoryCode} locations={locations} />
    </Suspense>
  );
}
