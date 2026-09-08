import type { Metadata } from 'next';

import { BlockRenderer } from '../../../components/marketing';
import { PreviewBridge } from '../../../components/marketing/preview-bridge';
import { getT } from '../../../lib/i18n';
import { getPagesConfig, pageBlocks } from '../../../lib/pages-config';
import { buildMetadata } from '../../../lib/seo';

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
    path: '/help',
    title: `${t.t('nav.help')} — ${t.t('app.name')}`,
    description: t.t('site.help.metaDescription'),
  });
  if (searchParams?.preview === '1') meta.robots = { index: false, follow: false };
  return meta;
}

export default async function HelpPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { locale } = params;
  const preview = searchParams?.preview === '1';
  const t = await getT(locale);
  const config = await getPagesConfig();
  const blocks = pageBlocks(config, 'help');

  if (preview) {
    return (
      <PreviewBridge initialBlocks={blocks} locale={locale} categories={[]} locations={[]} />
    );
  }
  return (
    <BlockRenderer
      blocks={blocks}
      ctx={{ t: t.t, locale, categories: [], locations: [], locationsCount: 0 }}
    />
  );
}
