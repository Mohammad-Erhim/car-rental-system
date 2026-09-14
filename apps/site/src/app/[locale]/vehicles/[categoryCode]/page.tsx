import { Briefcase, Check, ChevronRight, Cog, DoorOpen, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CarArt, carVariantFor } from '../../../../components/marketing/art';
import { SiteContainer } from '../../../../components/site-container';
import { VehicleReserve } from '../../../../components/vehicle-reserve';
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
  imageUrl: string | null;
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

async function load(code: string, locale: string): Promise<Category | null> {
  try {
    return await apiGet<Category>(
      `/catalogue/categories/${encodeURIComponent(code)}?locale=${encodeURIComponent(locale)}`,
      { revalidate: 600 },
    );
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
  const cat = await load(params.categoryCode, params.locale);
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
  const [cat, origin, locations] = await Promise.all([
    load(categoryCode, locale),
    seoOrigin(),
    apiGet<Array<{ code: string; name: string }>>('/config/locations', { revalidate: 300 })
      .then((rows) => rows.map((r) => ({ code: r.code, name: r.name })))
      .catch(() => [] as Array<{ code: string; name: string }>),
  ]);
  if (!cat) notFound();

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: cat.displayName,
    category: cat.class,
    description: cat.description ?? undefined,
    image: cat.imageUrl ? `${origin}${cat.imageUrl}` : undefined,
    url: `${origin}/${locale}/vehicles/${cat.code}`,
  };

  const specs = [
    { k: 'site.vehicle.passengers', v: cat.passengers, Icon: Users },
    { k: 'site.vehicle.luggage', v: cat.luggage, Icon: Briefcase },
    { k: 'site.vehicle.doors', v: cat.doors, Icon: DoorOpen },
    {
      k: 'site.vehicle.transmissionLabel',
      v: t.t(`site.vehicle.transmission.${cat.transmission}`),
      Icon: Cog,
    },
  ];

  return (
    <SiteContainer as="article" className="space-y-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />

      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-ink-muted">
        <Link href={`/${locale}`} className="hover:text-brand">
          {t.t('nav.rentACar')}
        </Link>
        <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        <Link href={`/${locale}/vehicles`} className="hover:text-brand">
          {t.t('site.vehicle.backToFleet')}
        </Link>
        <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        <span className="font-medium text-ink">{cat.displayName}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
        <div className="relative flex aspect-[4/3] items-end justify-center overflow-hidden rounded-3xl bg-brand-gradient shadow-lift">
          {cat.imageUrl ? (
            <img
              src={cat.imageUrl}
              alt={cat.displayName}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <>
              <span className="aurora" aria-hidden="true" />
              <CarArt
                variant={carVariantFor(cat.code)}
                className="art-shadow relative mb-2 w-[82%] text-on-brand"
              />
            </>
          )}
          <span className="absolute end-4 top-4 rounded-full bg-on-brand/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-on-brand backdrop-blur">
            {cat.class}
          </span>
        </div>

        <header className="space-y-4">
          <span className="eyebrow">{t.t('site.vehicle.eyebrow')}</span>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            {cat.displayName}
          </h1>
          {cat.description ? <p className="text-ink-muted">{cat.description}</p> : null}
          <dl className="flex flex-wrap gap-2 pt-1">
            {specs.map(({ k, v, Icon }) => (
              <div
                key={k}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink"
              >
                <Icon className="size-3.5 text-brand" aria-hidden="true" />
                <dt className="text-ink-muted">{t.t(k)}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </header>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-ink">{t.t('site.vehicle.specsTitle')}</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {specs.map(({ k, v, Icon }) => (
            <div key={k} className="surface-card p-4">
              <span className="icon-chip size-9 rounded-lg" aria-hidden="true">
                <Icon className="size-4" />
              </span>
              <dt className="mt-3 text-xs text-ink-muted">{t.t(k)}</dt>
              <dd className="text-lg font-bold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {cat.features.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">{t.t('site.vehicle.features')}</h2>
          <ul className="flex flex-wrap gap-2" data-testid="vehicle-features">
            {cat.features.map((f) => (
              <li
                key={f.code}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink"
              >
                <Check className="size-3.5 text-brand" aria-hidden="true" />
                {f.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="surface-card p-5 sm:p-6">
        <VehicleReserve categoryCode={cat.code} locations={locations} />
      </section>
    </SiteContainer>
  );
}
