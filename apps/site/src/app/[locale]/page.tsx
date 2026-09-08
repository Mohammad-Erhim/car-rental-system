import type { Metadata } from 'next';

import {
  CtaBand,
  Faq,
  FleetShowcase,
  Hero,
  HowItWorks,
  LocationsStrip,
  SearchCard,
  StatsBand,
  Testimonials,
  TrustBar,
  WhyUs,
  type FleetCategory,
  type LocationItem,
} from '../../components/marketing';
import { apiGet } from '../../lib/api';
import { getT } from '../../lib/i18n';
import { buildMetadata, jsonLd, seoOrigin } from '../../lib/seo';
import { getSeoConfig } from '../../lib/seo-config';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getT(params.locale);
  return buildMetadata({
    locale: params.locale,
    path: '/',
    title: `${t.t('app.name')} — ${t.t('app.customer.tagline')}`,
    description: t.t('site.home.metaDescription'),
  });
}

export default async function HomePage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const t = await getT(locale);
  const [categories, locations, origin, seo] = await Promise.all([
    apiGet<FleetCategory[]>('/catalogue/categories', { revalidate: 300 }).catch(
      () => [] as FleetCategory[],
    ),
    apiGet<Array<{ code: string; name: string }>>('/config/locations', { revalidate: 300 })
      .then((rows): LocationItem[] => rows.map((r) => ({ code: r.code, name: r.name })))
      .catch(() => [] as LocationItem[]),
    seoOrigin(),
    getSeoConfig(),
  ]);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'AutoRental',
    name: seo.siteName,
    url: `${origin}/${locale}`,
    description: seo.defaultDescription,
    ...(seo.organizationLogoUrl ? { logo: seo.organizationLogoUrl } : {}),
  };

  return (
    <div className="flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />

      <Hero t={t.t} />
      <SearchCard t={t.t} locale={locale} locations={locations} />
      <TrustBar t={t.t} />
      <FleetShowcase t={t.t} locale={locale} categories={categories} />
      <WhyUs t={t.t} />
      <HowItWorks t={t.t} />
      <StatsBand t={t.t} locationsCount={locations.length} />
      <Testimonials t={t.t} />
      <LocationsStrip t={t.t} locale={locale} locations={locations} />
      <Faq t={t.t} locale={locale} />
      <CtaBand t={t.t} locale={locale} />
    </div>
  );
}
