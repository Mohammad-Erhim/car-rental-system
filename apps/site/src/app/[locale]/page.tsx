import type { Metadata } from 'next';

import { BlockRenderer, type FleetCategory, type LocationItem } from '../../components/marketing';
import { apiGet } from '../../lib/api';
import { getT } from '../../lib/i18n';
import { getPagesConfig, pageBlocks } from '../../lib/pages-config';
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
  const [categories, locations, origin, seo, pages] = await Promise.all([
    apiGet<FleetCategory[]>('/catalogue/categories', { revalidate: 300 }).catch(
      () => [] as FleetCategory[],
    ),
    apiGet<Array<{ code: string; name: string }>>('/config/locations', { revalidate: 300 })
      .then((rows): LocationItem[] => rows.map((r) => ({ code: r.code, name: r.name })))
      .catch(() => [] as LocationItem[]),
    seoOrigin(),
    getSeoConfig(),
    getPagesConfig(),
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
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <BlockRenderer
        blocks={pageBlocks(pages, 'home')}
        ctx={{
          t: t.t,
          locale,
          categories,
          locations,
          locationsCount: locations.length,
        }}
      />
    </>
  );
}
