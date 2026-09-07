import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ACTIVE_LOCALES, getT } from '../../../../lib/i18n';
import { buildMetadata } from '../../../../lib/seo';

const SLUGS = ['terms', 'privacy'] as const;
type Slug = (typeof SLUGS)[number];

export function generateStaticParams() {
  return ACTIVE_LOCALES.flatMap((locale) => SLUGS.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; slug: string };
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
  return buildMetadata({
    locale: params.locale,
    path: `/legal/${params.slug}`,
    title: `${t.t(`site.legal.${params.slug}.title`)} — ${t.t('app.name')}`,
    description: t.t(`site.legal.${params.slug}.title`),
    type: 'article',
  });
}

export default async function LegalPage({ params }: { params: { locale: string; slug: string } }) {
  const t = await getT(params.locale);
  if (!SLUGS.includes(params.slug as Slug)) notFound();
  return (
    <article className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">
        {t.t(`site.legal.${params.slug}.title`)}
      </h1>
      <p className="text-sm text-muted-foreground">{t.t('site.legal.placeholder')}</p>
      <p className="whitespace-pre-line text-sm leading-relaxed">
        {t.t(`site.legal.${params.slug}.body`)}
      </p>
    </article>
  );
}
