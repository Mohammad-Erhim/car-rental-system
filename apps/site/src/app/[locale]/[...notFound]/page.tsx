import type { Metadata } from 'next';
import Link from 'next/link';

import { getT, isSupportedLocale } from '../../../lib/i18n';

/**
 * Anything under `/[locale]/…` that matches no real route. Real routes always win over this
 * catch-all. We render the localised "not found" state here (200 + `robots: noindex`) rather
 * than `notFound()` because `not-found.tsx` mis-renders under `output: 'standalone'` when it is
 * triggered from a dynamic segment in a production build (Next 14). Crawlers are kept off it by
 * the noindex header and by `robots.txt` / `sitemap.xml` listing only the real routes.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LocaleNotFound({ params }: { params: { locale: string } }) {
  const locale = isSupportedLocale(params.locale) ? params.locale : 'en';
  const t = await getT(locale);
  return (
    <div data-appstate="no-results" className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="text-muted-foreground">{t.t('notFound.body')}</p>
      <Link
        href={`/${locale}`}
        className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {t.t('notFound.goHome')}
      </Link>
    </div>
  );
}
