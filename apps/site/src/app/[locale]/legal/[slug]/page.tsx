import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BlockRenderer } from '../../../../components/marketing';
import { PreviewBridge } from '../../../../components/marketing/preview-bridge';
import { ACTIVE_LOCALES, getT } from '../../../../lib/i18n';
import { getPagesConfig, pageBlocks } from '../../../../lib/pages-config';
import { buildMetadata } from '../../../../lib/seo';

const SLUGS = ['terms', 'privacy', 'cookies'] as const;
type Slug = (typeof SLUGS)[number];
const PAGE_KEY_BY_SLUG: Record<Slug, 'legal-terms' | 'legal-privacy' | 'legal-cookies'> = {
  terms: 'legal-terms',
  privacy: 'legal-privacy',
  cookies: 'legal-cookies',
};

export function generateStaticParams() {
  return ACTIVE_LOCALES.flatMap((locale) => SLUGS.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: { locale: string; slug: string };
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<Metadata> {
  const t = await getT(params.locale);
  if (!SLUGS.includes(params.slug as Slug))
    return buildMetadata({
      locale: params.locale,
      path: '/',
      title: t.t('route.notFound.title'),
      description: '',
      noindex: true,
    });
  const meta = await buildMetadata({
    locale: params.locale,
    path: `/legal/${params.slug}`,
    title: `${t.t(`site.legal.${params.slug}.title`)} — ${t.t('app.name')}`,
    description: t.t(`site.legal.${params.slug}.description`),
    type: 'article',
  });
  if (searchParams?.preview === '1') meta.robots = { index: false, follow: false };
  return meta;
}

export default async function LegalPage({
  params,
  searchParams,
}: {
  params: { locale: string; slug: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { locale, slug } = params;
  if (!SLUGS.includes(slug as Slug)) notFound();
  const preview = searchParams?.preview === '1';
  const t = await getT(locale);
  const config = await getPagesConfig();
  const blocks = pageBlocks(config, PAGE_KEY_BY_SLUG[slug as Slug]);

  if (preview) {
    return <PreviewBridge initialBlocks={blocks} locale={locale} categories={[]} locations={[]} />;
  }
  return (
    <BlockRenderer
      blocks={blocks}
      ctx={{ t: t.t, locale, categories: [], locations: [], locationsCount: 0 }}
    />
  );
}
