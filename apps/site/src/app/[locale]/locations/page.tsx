import { ArrowRight, Clock, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteContainer } from '../../../components/site-container';
import { apiGet } from '../../../lib/api';
import { ACTIVE_LOCALES, getT } from '../../../lib/i18n';
import { buildMetadata } from '../../../lib/seo';

interface Location {
  code: string;
  name: string;
  address?: { city?: string | null; country?: string | null } | null;
  regularHours?: Array<{ day: number; open: string; close: string }> | null;
  afterHoursReturn?: boolean;
}

export const revalidate = 600;

export function generateStaticParams() {
  return ACTIVE_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getT(params.locale);
  return buildMetadata({
    locale: params.locale,
    path: '/locations',
    title: `${t.t('site.locations.metaTitle')} — ${t.t('app.name')}`,
    description: t.t('site.locations.metaDescription'),
  });
}

/** A common daily window if every open day shares one; else null. */
function commonHours(hours?: Location['regularHours']): string | null {
  const first = hours?.[0];
  if (!first) return null;
  const window = `${first.open}–${first.close}`;
  return hours.every((h) => `${h.open}–${h.close}` === window) ? window : null;
}

export default async function LocationsPage({ params }: { params: { locale: string } }) {
  const { locale } = params;
  const t = await getT(locale);
  const locations = await apiGet<Location[]>(
    `/config/locations?locale=${encodeURIComponent(locale)}`,
    { revalidate: 600 },
  ).catch(() => [] as Location[]);

  return (
    <SiteContainer className="space-y-10">
      <header className="max-w-2xl space-y-3">
        <span className="eyebrow">{t.t('site.locations.eyebrow')}</span>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          {t.t('site.locations.title')}
        </h1>
        <p className="text-ink-muted">{t.t('site.locations.lead')}</p>
      </header>

      {locations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline bg-surface-muted p-8 text-center">
          <p className="font-semibold text-ink">{t.t('site.locations.empty')}</p>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((l) => {
            const place = [l.address?.city, l.address?.country].filter(Boolean).join(', ');
            const hours = commonHours(l.regularHours);
            return (
              <li key={l.code}>
                <Link
                  href={`/${locale}/search?pickup=${encodeURIComponent(l.code)}`}
                  className="group flex h-full flex-col gap-3 surface-card hover-lift p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  <div className="flex items-start gap-3">
                    <span className="icon-chip" aria-hidden="true">
                      <MapPin className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-semibold leading-snug text-ink">{l.name}</h2>
                      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                        {l.code}
                        {place ? ` · ${place}` : ''}
                      </p>
                    </div>
                  </div>
                  {hours ? (
                    <p className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                      <Clock className="size-3.5 text-brand" aria-hidden="true" />
                      <span className="bidi-isolate">{hours}</span>
                    </p>
                  ) : null}
                  <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
                    {t.t('site.locations.startSearch')}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SiteContainer>
  );
}
