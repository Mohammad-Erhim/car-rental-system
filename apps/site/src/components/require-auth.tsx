/**
 * Client guard for authed customer pages (`/account/*`, `/trips*`). Anonymous visitors are sent
 * to sign-in with the current path stashed as the return target (FLOW-CUS-002, SRS-UI-006).
 */
'use client';

import { stashReturnTo } from '@carrental/client';
import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { Spinner } from '@carrental/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useLocale } from '../lib/nav';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { status, actor } = useAuth();

  useEffect(() => {
    if (status === 'anonymous' || (status === 'authenticated' && !actor)) {
      stashReturnTo(pathname || `/${locale}/account`);
      router.replace(`/${locale}/sign-in`);
    }
  }, [status, actor, pathname, locale, router]);

  if (status !== 'authenticated' || !actor) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('guard.checkingSession')} />
      </div>
    );
  }

  return <>{children}</>;
}
