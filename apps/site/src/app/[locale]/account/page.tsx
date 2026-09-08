'use client';

import { useI18n } from '@carrental/i18n/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@carrental/ui';
import { CreditCard, FileText, IdCard, UserRound } from 'lucide-react';
import Link from 'next/link';

import { useAuth } from '../../../lib/auth-context';
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
      <h1 className="text-xl font-semibold">{t('account.title')}</h1>
      {actor && !actor.emailVerified ? (
        <Badge variant="warning">{t('account.emailNotVerified')}</Badge>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('account.yourTrips')}</CardTitle>
          <CardDescription>{t('account.yourTripsHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!trips.data?.length ? (
            <p className="text-sm text-muted-foreground" data-testid="account-trips-empty">
              {t('account.noTripsYet')}
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {trips.data.slice(0, 3).map((r) => (
                <li key={r.reference} className="flex items-center justify-between gap-3">
                  <span className="bidi-isolate font-mono">{r.reference}</span>
                  <span className="text-muted-foreground">
                    {formatMinor(r.totalMinor, r.currency, uiLocale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button asChild size="sm" variant="outline">
            <Link href={`/${locale}/trips`}>{t('account.viewAllTrips')}</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map(({ href, label, Icon, hint }) => (
          <Link
            key={href}
            href={href}
            className="rounded-lg border p-4 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center gap-2 font-medium">
              <Icon className="size-4 text-primary" aria-hidden="true" />
              {label}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
