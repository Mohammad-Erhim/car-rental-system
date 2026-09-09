'use client';

import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { AppStateView, Badge } from '@carrental/ui';

import { ReservationCard } from '../../../../components/reservation-card';
import { useMyReservations } from '../../../../lib/customer-hooks';
import { useLocale } from '../../../../lib/nav';

/** SCREEN-CUS-023 — payments & receipts: charges per booking; open a booking for the breakdown. */
export default function PaymentsPage() {
  const { t, locale: uiLocale } = useI18n();
  const locale = useLocale();
  const { actor } = useAuth();
  const list = useMyReservations(!!actor);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t('payments.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('payments.intro')}</p>
      </div>

      {list.isLoading ? (
        <AppStateView kind="loading" inline title={t('state.loading.title')} />
      ) : list.isError ? (
        <AppStateView
          kind="failure"
          inline
          title={t('state.failure.title')}
          primaryAction={{ label: t('action.retry'), onClick: () => list.refetch() }}
        />
      ) : !list.data?.length ? (
        <AppStateView kind="empty" inline title={t('payments.none')} />
      ) : (
        <ul className="space-y-3" data-testid="payments-list">
          {list.data.map((r) => (
            <li key={r.reference}>
              <ReservationCard
                r={r}
                uiLocale={uiLocale}
                href={`/${locale}/trips/${r.reference}`}
                actionLabel={t('payments.viewBooking')}
                amountLabel={t('payments.charged')}
                badge={<Badge variant="neutral">{r.categoryCode}</Badge>}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
