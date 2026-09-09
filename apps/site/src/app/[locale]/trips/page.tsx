'use client';

import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { AppStateView, Badge, Button, Card, CardContent } from '@carrental/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { formatMinor, useMyReservations } from '../../../lib/customer-hooks';
import { useLocale } from '../../../lib/nav';

/** SCREEN-CUS-014 — the signed-in customer's reservations. */
export default function TripsPage() {
  const { t, locale: uiLocale } = useI18n();
  const locale = useLocale();
  const router = useRouter();
  const { status } = useAuth();
  const authed = status === 'authenticated';
  const trips = useMyReservations(authed);

  if (!authed) {
    return (
      <AppStateView
        kind="empty"
        title={t('trips.signInPrompt')}
        primaryAction={{
          label: t('action.signIn'),
          onClick: () => router.push(`/${locale}/sign-in`),
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">{t('trips.title')}</h1>

      {trips.isLoading ? (
        <AppStateView kind="loading" inline title={t('state.loading.title')} />
      ) : trips.isError ? (
        <AppStateView
          kind="failure"
          inline
          title={t('trips.loadError')}
          primaryAction={{ label: t('action.retry'), onClick: () => trips.refetch() }}
        />
      ) : !trips.data?.length ? (
        <AppStateView
          kind="empty"
          title={t('trips.none')}
          description={t('trips.noneHint')}
          primaryAction={{
            label: t('trips.findACar'),
            onClick: () => router.push(`/${locale}/search`),
          }}
        />
      ) : (
        <ul className="space-y-3" data-testid="trips-list">
          {trips.data.map((r) => (
            <li key={r.reference}>
              <Card data-testid={`trip-${r.reference}`}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bidi-isolate font-mono font-semibold">{r.reference}</span>
                      <Badge variant={r.state === 'confirmed' ? 'success' : 'neutral'}>
                        {t(`reservation.state.${r.state}`)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {r.categoryCode} · {r.pickupLocationCode} ·{' '}
                      {new Date(r.pickupAt).toLocaleDateString(uiLocale)} –{' '}
                      {new Date(r.returnAt).toLocaleDateString(uiLocale)}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-semibold">
                      {formatMinor(r.totalMinor, r.currency, uiLocale)}
                    </p>
                    <Button asChild size="sm" variant="outline" className="mt-2">
                      <Link
                        href={`/${locale}/trips/${r.reference}`}
                        data-testid={`trip-manage-${r.reference}`}
                      >
                        {t('trips.manage')}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
