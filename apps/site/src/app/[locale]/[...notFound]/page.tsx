import { ArrowRight, Compass } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CarArt } from '../../../components/marketing/art';
import { getT, isSupportedLocale } from '../../../lib/i18n';

/**
 * Anything under `/[locale]/…` that matches no real route. Real routes always win over this
 * catch-all. We render the localised "not found" state here (200 + `robots: noindex`) rather
 * than `notFound()` because `not-found.tsx` mis-renders under `output: 'standalone'` when it is
 * triggered from a dynamic segment in a production build (Next 14). Crawlers are kept off it by
 * the noindex header and by `robots.txt` / `sitemap.xml` listing only the real routes.
 */
export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const locale = isSupportedLocale(params.locale) ? params.locale : 'en';
  const t = await getT(locale);
  return {
    title: `${t.t('route.notFound.title')} — ${t.t('app.name')}`,
    robots: { index: false, follow: false },
  };
}

export default async function LocaleNotFound({ params }: { params: { locale: string } }) {
  const locale = isSupportedLocale(params.locale) ? params.locale : 'en';
  const t = await getT(locale);
  return (
    <div
      data-appstate="no-results"
      className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center"
    >
      <div className="relative flex w-full max-w-xs items-center justify-center overflow-hidden rounded-3xl bg-brand-gradient p-8 shadow-lift">
        <span className="aurora" aria-hidden="true" />
        <CarArt variant="compact" className="art-shadow relative w-3/4 text-on-brand" />
      </div>
      <h1 className="mt-8 text-5xl font-extrabold tracking-tight text-ink">404</h1>
      <p className="mt-2 text-ink-muted">{t.t('notFound.body')}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={`/${locale}`}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t.t('notFound.goHome')}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
        <Link
          href={`/${locale}/search`}
          className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-surface px-5 py-2.5 text-sm font-semibold text-ink hover-lift"
        >
          <Compass className="size-4 text-brand" aria-hidden="true" />
          {t.t('action.search')}
        </Link>
      </div>
    </div>
  );
}
