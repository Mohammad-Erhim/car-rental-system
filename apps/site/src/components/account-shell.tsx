'use client';

import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { CreditCard, FileText, IdCard, LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';

import { useLocale } from '../lib/nav';

interface Tab {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  exact?: boolean;
}

/** Account sub-navigation + identity + sign-out (design §7.1). Wraps every `/account/*` page.
 *  A sidebar on desktop, an identity row + scrollable tab strip on mobile. */
export function AccountShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname() || '';
  const { actor, signOut } = useAuth();

  const tabs: Tab[] = [
    { href: `/${locale}/account`, label: t('nav.account'), Icon: UserRound, exact: true },
    { href: `/${locale}/account/profile`, label: t('account.section.profile'), Icon: UserRound },
    { href: `/${locale}/account/drivers`, label: t('account.section.drivers'), Icon: IdCard },
    { href: `/${locale}/account/payments`, label: t('account.section.payments'), Icon: CreditCard },
    { href: `/${locale}/account/data`, label: t('account.section.data'), Icon: FileText },
  ];

  const initials =
    (actor?.displayName ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';

  async function onSignOut() {
    await signOut();
    router.push(`/${locale}`);
  }

  const isActive = (tab: Tab) =>
    tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);

  const identity = (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-brand-foreground"
        aria-hidden="true"
      >
        {initials}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold text-ink">{actor?.displayName ?? t('nav.account')}</p>
        {actor && !actor.emailVerified ? (
          <p className="text-xs font-medium text-warning">{t('account.emailNotVerified')}</p>
        ) : (
          <p className="text-xs text-ink-muted">{t('account.memberLabel')}</p>
        )}
      </div>
    </div>
  );

  const signOutButton = (
    <button
      type="button"
      onClick={onSignOut}
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-hairline px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
    >
      <LogOut className="size-4" aria-hidden="true" />
      {t('action.signOut')}
    </button>
  );

  return (
    <div className="space-y-5 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-10 lg:space-y-0">
      {/* mobile: identity + horizontal scroll strip */}
      <div className="space-y-4 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          {identity}
          {signOutButton}
        </div>
        <nav
          aria-label={t('account.title')}
          className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive(tab) ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                isActive(tab)
                  ? 'bg-brand/10 text-brand'
                  : 'bg-surface-muted text-ink-muted hover:text-ink'
              }`}
            >
              <tab.Icon className="size-4 shrink-0" aria-hidden="true" />
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* desktop: sidebar card */}
      <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
        <div className="surface-card rounded-2xl p-4">
          {identity}
          <nav aria-label={t('account.title')} className="mt-4 flex flex-col gap-0.5">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive(tab) ? 'page' : undefined}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(tab)
                    ? 'bg-brand/10 text-brand'
                    : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                }`}
              >
                <tab.Icon className="size-4 shrink-0" aria-hidden="true" />
                {tab.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4">{signOutButton}</div>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
