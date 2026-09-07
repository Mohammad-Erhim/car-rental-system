import type { Metadata } from 'next';
import Link from 'next/link';

import { HomeSearch } from '../../components/home-search';
import { apiGet } from '../../lib/api';
import { getT } from '../../lib/i18n';
import { buildMetadata, jsonLd, seoOrigin } from '../../lib/seo';
import { getSeoConfig } from '../../lib/seo-config';

interface Category {
  code: string;
  displayName: string;
  description: string | null;
  passengers: number;
  luggage: number;
  transmission: string;
}

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
  const [categories, origin, seo] = await Promise.all([
    apiGet<Category[]>('/catalogue/categories', { revalidate: 300 }).catch(() => [] as Category[]),
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
    <div className="space-y-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />

      <section className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t.t('site.home.heroTitle')}
        </h1>
        <p className="max-w-2xl text-muted-foreground">{t.t('site.home.heroSubtitle')}</p>
        <div className="rounded-xl border bg-card p-4 shadow-sm md:p-6">
          <HomeSearch locale={locale} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t.t('site.home.browseTitle')}</h2>
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.t('state.noResults.title')}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <li key={c.code}>
                <Link
                  href={`/${locale}/vehicles/${c.code}`}
                  className="block h-full rounded-lg border bg-card p-4 transition-colors hover:border-primary"
                >
                  <h3 className="font-medium">{c.displayName}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {c.description ?? ''}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t.t('site.vehicle.specs', {
                      passengers: c.passengers,
                      luggage: c.luggage,
                      transmission: t.t(`site.vehicle.transmission.${c.transmission}`),
                    })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
