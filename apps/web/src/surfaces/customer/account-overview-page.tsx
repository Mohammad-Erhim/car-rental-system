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
import { CreditCard, FileText, IdCard, LogOut, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../lib/auth.js';

/**
 * SCREEN-CUS-011 — Account overview. Active rental → upcoming reservation → pending actions →
 * account sections. Trips/rental data land in later stages; the section navigation is here now.
 */
export function AccountOverviewPage() {
  const { t } = useI18n();
  const { actor, signOut } = useAuth();

  const sections = [
    {
      to: '/account/profile',
      label: 'Profile & preferences',
      Icon: UserRound,
      hint: 'Name, contact, language, communication',
    },
    {
      to: '/account/drivers',
      label: 'Saved drivers & documents',
      Icon: IdCard,
      hint: 'Reusable driver details',
    },
    {
      to: '/account/payments',
      label: 'Payments & receipts',
      Icon: CreditCard,
      hint: 'Transactions and refunds',
    },
    {
      to: '/account/data',
      label: 'Data requests & closure',
      Icon: FileText,
      hint: 'Access, correction, close account',
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('nav.account')}</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium">{actor?.displayName}</span>
            {!actor?.emailVerified ? (
              <Badge variant="warning" className="ms-2">
                Email not verified
              </Badge>
            ) : null}
          </p>
        </div>
        <Button variant="outline" onClick={() => void signOut()}>
          <LogOut className="size-4" aria-hidden="true" />
          {t('action.signOut')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your trips</CardTitle>
          <CardDescription>Reservations and active rentals appear here.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" data-testid="trips-placeholder">
            No reservations yet — booking is delivered in a later stage. Start a search from the
            home page.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map(({ to, label, Icon, hint }) => (
          <Link
            key={to}
            to={to}
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
