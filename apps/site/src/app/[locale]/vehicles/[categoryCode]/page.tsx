import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { apiGet } from '../../../../lib/api';
import { ACTIVE_LOCALES, getT } from '../../../../lib/i18n';
import { buildMetadata, jsonLd, seoOrigin } from '../../../../lib/seo';

interface Category {
  code: string;
  displayName: string;
  description: string | null;
  class: string;
  passengers: number;
  luggage: number;
  doors: number;
  transmission: string;
  features: Array<{ code: string; label: string; group: string }>;
}

export const revalidate = 600;

export async function generateStaticParams() {
  try {
    const cats = await apiGet<Category[]>('/catalogue/categories', { revalidate: 600 });
    return ACTIVE_LOCALES.flatMap((locale) => cats.map((c) => ({ locale, categoryCode: c.code })));
  } catch {
    return [];
  }
}

async function load(code: string): Promise<Category | null> {
  try {
    return await apiGet<Category>(`/catalogue/categories/${encodeURIComponent(code)}`, {
      revalidate: 600,
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string; categoryCode: string };
}): Promise<Metadata> {
  const t = await getT(params.locale);
  const cat = await load(params.categoryCode);
  if (!cat)
    return buildMetadata({
      locale: params.locale,
      path: '/search',
      title: t.t('route.notFound.title'),
      description: '',
      noindex: true,
    });
  return buildMetadata({
    locale: params.locale,
    path: `/vehicles/${cat.code}`,
    title: `${cat.displayName} — ${t.t('app.name')}`,
    description: cat.description ?? t.t('site.vehicle.metaFallback', { name: cat.displayName }),
    type: 'article',
  });
}

export default async function VehicleDetailPage({
  params,
}: {
  params: { locale: string; categoryCode: string };
}) {
  const { locale, categoryCode } = params;
  const t = await getT(locale);
  const [cat, origin] = await Promise.all([load(categoryCode), seoOrigin()]);
  if (!cat) notFound();

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: cat.displayName,
    category: cat.class,
    description: cat.description ?? undefined,
    url: `${origin}/${locale}/vehicles/${cat.code}`,
  };

  return (
    <article className="space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <a href={`/${locale}`} className="hover:text-foreground">
          {t.t('nav.rentACar')}
        </a>{' '}
        / <span className="text-foreground">{cat.displayName}</span>
      </nav>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{cat.displayName}</h1>
        <p className="text-muted-foreground">{cat.description}</p>
      </header>

      <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-4">
        {[
          ['site.vehicle.passengers', cat.passengers],
          ['site.vehicle.luggage', cat.luggage],
          ['site.vehicle.doors', cat.doors],
        ].map(([k, v]) => (
          <div key={k as string}>
            <dt className="text-xs text-muted-foreground">{t.t(k as string)}</dt>
            <dd className="text-lg font-semibold">{v as number}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs text-muted-foreground">{t.t('site.vehicle.transmissionLabel')}</dt>
          <dd className="text-lg font-semibold">
            {t.t(`site.vehicle.transmission.${cat.transmission}`)}
          </dd>
        </div>
      </dl>

      {cat.features.length ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold">{t.t('site.vehicle.features')}</h2>
          <ul className="flex flex-wrap gap-2">
            {cat.features.map((f) => (
              <li key={f.code} className="rounded-full bg-muted px-3 py-1 text-xs">
                {f.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <a
        href={`/${locale}/search`}
        className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {t.t('site.vehicle.checkAvailability')}
      </a>
    </article>
  );
}
