'use client';

import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { AppStateView, Badge, Button, Card, CardContent } from '@carrental/ui';
import Link from 'next/link';

import { formatMinor, useMyReservations } from '../../../../lib/customer-hooks';
import { useLocale } from '../../../../lib/nav';

/** SCREEN-CUS-023 — payments & receipts: charges per booking; open a booking for the breakdown. */
export default function PaymentsPage() {
  const { t, locale: uiLocale } = useI18n();
  const locale = useLocale();
  const { actor } = useAuth();
  const list = useMyReservations(!!actor);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('payments.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('payments.intro')}</p>

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
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bidi-isolate font-mono font-semibold">{r.reference}</span>
                      <Badge variant="neutral">{r.categoryCode}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(r.pickupAt).toLocaleDateString(uiLocale)} –{' '}
                      {new Date(r.returnAt).toLocaleDateString(uiLocale)}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-xs text-muted-foreground">{t('payments.charged')}</p>
                    <p className="font-semibold">
                      {formatMinor(r.totalMinor, r.currency, uiLocale)}
                    </p>
                    <Button asChild size="sm" variant="outline" className="mt-2">
                      <Link href={`/${locale}/trips/${r.reference}`}>
                        {t('payments.viewBooking')}
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
