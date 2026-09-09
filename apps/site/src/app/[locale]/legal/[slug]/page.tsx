import { pickText } from '@carrental/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BlockRenderer } from '../../../../components/marketing';
import { PreviewBridge } from '../../../../components/marketing/preview-bridge';
import { getConsentConfig } from '../../../../lib/consent-config';
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

  const consent = slug === 'cookies' ? await getConsentConfig() : null;
  const catName = (id: string) =>
    pickText(consent?.categories.find((c) => c.id === id)?.name, locale) || id;

  return (
    <>
      <BlockRenderer
        blocks={blocks}
        ctx={{ t: t.t, locale, categories: [], locations: [], locationsCount: 0 }}
      />
      {consent && consent.cookieTable.length ? (
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
          <h2 className="text-lg font-semibold text-ink">{t.t('site.cookie.table.heading')}</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-start text-sm">
              <thead className="bg-surface-muted text-ink-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">
                    {t.t('site.cookie.table.name')}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t.t('site.cookie.table.provider')}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t.t('site.cookie.table.category')}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t.t('site.cookie.table.purpose')}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t.t('site.cookie.table.duration')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {consent.cookieTable.map((row, i) => (
                  <tr key={`${row.name}-${i}`} className="text-ink">
                    <td className="px-3 py-2 font-mono text-xs">{row.name}</td>
                    <td className="px-3 py-2">{row.provider}</td>
                    <td className="px-3 py-2">{catName(row.category)}</td>
                    <td className="px-3 py-2 text-ink-muted">{pickText(row.purpose, locale)}</td>
                    <td className="px-3 py-2">{row.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
