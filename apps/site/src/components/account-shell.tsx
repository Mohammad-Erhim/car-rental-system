'use client';

import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { Button } from '@carrental/ui';
import { CreditCard, FileText, IdCard, LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { useLocale } from '../lib/nav';

/** Account sub-navigation + sign-out (design §7.1). Wraps every `/account/*` page. */
export function AccountShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname() || '';
  const { actor, signOut } = useAuth();

  const tabs = [
    { href: `/${locale}/account`, label: t('nav.account'), Icon: UserRound, exact: true },
    { href: `/${locale}/account/profile`, label: t('account.section.profile'), Icon: UserRound },
    { href: `/${locale}/account/drivers`, label: t('account.section.drivers'), Icon: IdCard },
    { href: `/${locale}/account/payments`, label: t('account.section.payments'), Icon: CreditCard },
    { href: `/${locale}/account/data`, label: t('account.section.data'), Icon: FileText },
  ];

  async function onSignOut() {
    await signOut();
    router.push(`/${locale}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {actor ? (
          <p className="text-sm text-muted-foreground">
            {t('account.signedInAs', { name: actor.displayName })}
          </p>
        ) : (
          <span />
        )}
        <Button variant="outline" size="sm" onClick={onSignOut}>
          <LogOut className="size-4" aria-hidden="true" />
          {t('action.signOut')}
        </Button>
      </div>

      <nav aria-label={t('account.title')} className="flex flex-wrap gap-1 border-b pb-2 text-sm">
        {tabs.map(({ href, label, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
