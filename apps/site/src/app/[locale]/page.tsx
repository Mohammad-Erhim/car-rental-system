import type { Metadata } from 'next';

import { BlockRenderer, type FleetCategory, type LocationItem } from '../../components/marketing';
import { PreviewBridge } from '../../components/marketing/preview-bridge';
import { apiGet } from '../../lib/api';
import { getT } from '../../lib/i18n';
import { getPagesConfig, pageBlocks } from '../../lib/pages-config';
import { buildMetadata, jsonLd, seoOrigin } from '../../lib/seo';
import { getSeoConfig } from '../../lib/seo-config';

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<Metadata> {
  const t = await getT(params.locale);
  const meta = await buildMetadata({
    locale: params.locale,
    path: '/',
    title: `${t.t('app.name')} — ${t.t('app.customer.tagline')}`,
    description: t.t('site.home.metaDescription'),
  });
  if (searchParams?.preview === '1') meta.robots = { index: false, follow: false };
  return meta;
}

export default async function HomePage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { locale } = params;
  const preview = searchParams?.preview === '1';
  const t = await getT(locale);
  const [categories, locations, origin, seo, pages] = await Promise.all([
    apiGet<FleetCategory[]>('/catalogue/categories', { revalidate: preview ? 0 : 300 }).catch(
      () => [] as FleetCategory[],
    ),
    apiGet<Array<{ code: string; name: string }>>('/config/locations', {
      revalidate: preview ? 0 : 300,
    })
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

  const blocks = pageBlocks(pages, 'home');

  return (
    <>
      {!preview ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      ) : null}
      {preview ? (
        <PreviewBridge
          initialBlocks={blocks}
          locale={locale}
          categories={categories}
          locations={locations}
        />
      ) : (
        <BlockRenderer
          blocks={blocks}
          ctx={{ t: t.t, locale, categories, locations, locationsCount: locations.length }}
        />
      )}
    </>
  );
}
