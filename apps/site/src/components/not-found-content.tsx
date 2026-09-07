'use client';

import { useI18n } from '@carrental/i18n/react';
import Link from 'next/link';

import { useLocale } from '../lib/nav';

/** Localised body for `[locale]/not-found.tsx` (a server file that can't take route params). */
export function NotFoundContent() {
  const { t } = useI18n();
  const locale = useLocale();
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="text-muted-foreground">{t('error.notFound')}</p>
      <Link href={`/${locale}`} className="text-primary underline underline-offset-4">
        {t('notFound.home')}
      </Link>
    </div>
  );
}
