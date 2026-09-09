'use client';

import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { AppStateView, Badge } from '@carrental/ui';
import { useRouter } from 'next/navigation';

import { ReservationCard } from '../../../components/reservation-card';
import { useMyReservations } from '../../../lib/customer-hooks';
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
      <h1 className="text-2xl font-bold tracking-tight text-ink">{t('trips.title')}</h1>

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
              <ReservationCard
                r={r}
                uiLocale={uiLocale}
                href={`/${locale}/trips/${r.reference}`}
                actionLabel={t('trips.manage')}
                actionTestid={`trip-manage-${r.reference}`}
                testid={`trip-${r.reference}`}
                badge={
                  <Badge variant={r.state === 'confirmed' ? 'success' : 'neutral'}>
                    {t(`reservation.state.${r.state}`)}
                  </Badge>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
