'use client';

import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { Button } from '@carrental/ui';
import { AlertTriangle, ArrowRight, CreditCard, FileText, IdCard, UserRound } from 'lucide-react';
import Link from 'next/link';

import { formatMinor, useMyReservations } from '../../../lib/customer-hooks';
import { useLocale } from '../../../lib/nav';

/** SCREEN-CUS-011 — account overview: trips summary + section navigation. */
export default function AccountOverviewPage() {
  const { t, locale: uiLocale } = useI18n();
  const locale = useLocale();
  const { actor } = useAuth();
  const trips = useMyReservations(!!actor);

  const sections = [
    {
      href: `/${locale}/account/profile`,
      label: t('account.section.profile'),
      Icon: UserRound,
      hint: t('account.section.profileHint'),
    },
    {
      href: `/${locale}/account/drivers`,
      label: t('account.section.drivers'),
      Icon: IdCard,
      hint: t('account.section.driversHint'),
    },
    {
      href: `/${locale}/account/payments`,
      label: t('account.section.payments'),
      Icon: CreditCard,
      hint: t('account.section.paymentsHint'),
    },
    {
      href: `/${locale}/account/data`,
      label: t('account.section.data'),
      Icon: FileText,
      hint: t('account.section.dataHint'),
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">{t('account.title')}</h1>

      {actor && !actor.emailVerified ? (
        <p className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm font-medium text-ink">
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
          {t('account.emailNotVerified')}
        </p>
      ) : null}

      <section className="surface-card rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">{t('account.yourTrips')}</h2>
            <p className="mt-0.5 text-sm text-ink-muted">{t('account.yourTripsHint')}</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/${locale}/trips`}>
              {t('account.viewAllTrips')}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {!trips.data?.length ? (
          <p className="mt-4 text-sm text-ink-muted" data-testid="account-trips-empty">
            {t('account.noTripsYet')}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-hairline">
            {trips.data.slice(0, 3).map((r) => (
              <li key={r.reference} className="flex items-center justify-between gap-3 py-2.5">
                <span className="bidi-isolate font-mono text-sm text-ink">{r.reference}</span>
                <span className="text-sm font-medium text-ink-muted">
                  {formatMinor(r.totalMinor, r.currency, uiLocale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map(({ href, label, Icon, hint }) => (
          <Link
            key={href}
            href={href}
            className="surface-card hover-lift group rounded-2xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <div className="flex items-center gap-3">
              <span className="icon-chip size-10 rounded-xl" aria-hidden="true">
                <Icon className="size-5" />
              </span>
              <span className="font-semibold text-ink">{label}</span>
              <ArrowRight
                className="ms-auto size-4 text-ink-muted transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                aria-hidden="true"
              />
            </div>
            <p className="mt-2 text-sm text-ink-muted">{hint}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
