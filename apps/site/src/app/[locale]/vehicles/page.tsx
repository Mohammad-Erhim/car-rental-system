import { ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FleetShowcase, type FleetCategory } from '../../../components/marketing';
import { SiteContainer } from '../../../components/site-container';
import { apiGet } from '../../../lib/api';
import { ACTIVE_LOCALES, getT } from '../../../lib/i18n';
import { buildMetadata } from '../../../lib/seo';

export const revalidate = 600;

export function generateStaticParams() {
  return ACTIVE_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getT(params.locale);
  return buildMetadata({
    locale: params.locale,
    path: '/vehicles',
    title: `${t.t('site.fleet.metaTitle')} — ${t.t('app.name')}`,
    description: t.t('site.fleet.metaDescription'),
  });
}

/** SCREEN-CUS-002 (full catalogue) — every bookable class in one browsable gallery, real photos
 *  where a category has one uploaded, generated art as the fallback. The homepage's own fleet
 *  section is a teaser of this same list (first few, via the page-builder's `limit`). */
export default async function VehiclesPage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const t = await getT(locale);
  const categories = await apiGet<FleetCategory[]>(
    `/catalogue/categories?locale=${encodeURIComponent(locale)}`,
    { revalidate: 600 },
  ).catch(() => [] as FleetCategory[]);

  return (
    <>
      <SiteContainer className="pb-0 pt-8">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-ink-muted">
          <Link href={`/${locale}`} className="hover:text-brand">
            {t.t('nav.rentACar')}
          </Link>
          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
          <span className="font-medium text-ink">{t.t('site.home.fleet.title')}</span>
        </nav>
      </SiteContainer>
      <FleetShowcase t={t.t} locale={locale} categories={categories} headingAs="h1" />
    </>
  );
}
