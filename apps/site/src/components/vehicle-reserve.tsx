'use client';

import { useI18n } from '@carrental/i18n/react';
import { AppStateView, Badge, Button } from '@carrental/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { ApiError } from '../lib/api-client';
import { formatMinor, useAvailabilitySearch, useCreateQuote } from '../lib/customer-hooks';
import { useLocale } from '../lib/nav';

/**
 * SCREEN-CUS-003 — the priced "reserve" island on the vehicle page. Reads the pickup window from
 * the query, prices it live for this category, and on Reserve creates a quote + checkout hold
 * then routes to `/[locale]/checkout`.
 */
function ReserveInner({ categoryCode }: { categoryCode: string }) {
  const { t, locale: uiLocale } = useI18n();
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const pickup = params.get('pickup') ?? '';
  const pickupAt = params.get('pickupAt') ?? '';
  const returnAt = params.get('returnAt') ?? '';
  const createQuote = useCreateQuote();
  const [error, setError] = useState<string | null>(null);

  const hasWindow = Boolean(pickup && pickupAt && returnAt);
  const search = useAvailabilitySearch(
    hasWindow ? { pickupLocationCode: pickup, pickupAt, returnAt, categoryCode } : null,
  );
  const option = search.data?.options.find((o) => o.categoryCode === categoryCode) ?? null;

  async function reserve() {
    setError(null);
    try {
      const q = await createQuote.mutateAsync({
        pickupLocationCode: pickup,
        pickupAt,
        returnAt,
        categoryCode,
        hold: true,
        holderKey: `site-${Date.now()}`,
      });
      router.push(`/${locale}/checkout?quote=${q.reference}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('checkout.genericError'));
    }
  }

  if (!hasWindow) {
    return (
      <AppStateView
        kind="empty"
        inline
        title={t('site.vehicle.searchFirst')}
        primaryAction={{
          label: t('action.search'),
          onClick: () => router.push(`/${locale}/search`),
        }}
      />
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold">{t('site.vehicle.priceForTrip')}</h2>
      {search.isLoading ? (
        <AppStateView kind="loading" inline title={t('state.loading.title')} />
      ) : !option || option.fromTotalMinor == null ? (
        <AppStateView kind="no-results" inline title={t('site.vehicle.noPrice')} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {t('reservation.hours', { hours: search.data!.durationHours })}
            </span>
            <span className="text-xl font-semibold" data-testid="detail-total">
              {formatMinor(option.fromTotalMinor, option.currency ?? 'USD', uiLocale)}
            </span>
          </div>
          <Badge
            variant={option.bookableCount > 0 ? 'success' : 'warning'}
            data-testid="detail-availability"
          >
            {t('site.search.available', { n: option.bookableCount })}
          </Badge>
          {error ? (
            <p className="text-sm text-destructive" data-testid="reserve-error">
              {error}
            </p>
          ) : null}
          <Button
            onClick={reserve}
            loading={createQuote.isPending}
            disabled={option.bookableCount < 1}
            data-testid="reserve-button"
          >
            {t('site.vehicle.reserveContinue')}
          </Button>
        </>
      )}
      <Link
        href={`/${locale}/search?${new URLSearchParams({ pickup, pickupAt, returnAt }).toString()}`}
        className="block text-sm text-primary underline underline-offset-4"
      >
        ← {t('site.search.title')}
      </Link>
    </div>
  );
}

export function VehicleReserve({ categoryCode }: { categoryCode: string }) {
  return (
    <Suspense fallback={null}>
      <ReserveInner categoryCode={categoryCode} />
    </Suspense>
  );
}
