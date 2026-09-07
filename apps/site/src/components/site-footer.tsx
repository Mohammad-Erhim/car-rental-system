'use client';

import { useI18n } from '@carrental/i18n/react';
import Link from 'next/link';

export function SiteFooter({ locale }: { locale: string }) {
  const { t } = useI18n();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground">
        <span>
          © {year} {t('app.name')}
        </span>
        <nav aria-label="Legal" className="flex flex-wrap gap-4">
          <Link href={`/${locale}/legal/terms`} className="hover:text-foreground">
            {t('site.footer.terms')}
          </Link>
          <Link href={`/${locale}/legal/privacy`} className="hover:text-foreground">
            {t('site.footer.privacy')}
          </Link>
          <Link href={`/${locale}/help`} className="hover:text-foreground">
            {t('nav.help')}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
