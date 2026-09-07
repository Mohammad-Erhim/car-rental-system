import type { Metadata } from 'next';
import Link from 'next/link';

import { apiPost } from '../../../lib/api';
import { getT } from '../../../lib/i18n';
import { buildMetadata } from '../../../lib/seo';

interface Option {
  categoryCode: string;
  categoryName: string;
  available: number;
  estimatedTotal?: { amountMinor: number; currency: string } | null;
}
interface SearchResponse {
  options: Option[];
  currency?: string;
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getT(params.locale);
  return buildMetadata({
    locale: params.locale,
    path: '/search',
    title: `${t.t('site.search.title')} — ${t.t('app.name')}`,
    description: t.t('site.search.metaDescription'),
  });
}

function money(minor: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { locale } = params;
  const t = await getT(locale);
  const pickup = typeof searchParams.pickup === 'string' ? searchParams.pickup : '';
  const pickupAt = typeof searchParams.pickupAt === 'string' ? searchParams.pickupAt : '';
  const returnAt = typeof searchParams.returnAt === 'string' ? searchParams.returnAt : '';

  let data: SearchResponse | null = null;
  let error = false;
  if (pickup && pickupAt && returnAt) {
    try {
      data = await apiPost<SearchResponse>('/discovery/search', {
        pickupLocationCode: pickup,
        pickupAt,
        returnAt,
      });
    } catch {
      error = true;
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t.t('site.search.title')}</h1>
      {pickup ? (
        <p className="text-sm text-muted-foreground">
          {t.t('site.search.summary', { location: pickup })}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t.t('site.search.noQuery')}</p>
      )}

      {error ? (
        <p className="text-sm text-destructive">{t.t('error.generic')}</p>
      ) : !data ? null : data.options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.t('state.noResults.title')}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.options.map((o) => (
            <li key={o.categoryCode} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium">{o.categoryName}</h2>
                  <p className="text-xs text-muted-foreground">
                    {t.t('site.search.available', { n: o.available })}
                  </p>
                </div>
                {o.estimatedTotal ? (
                  <p className="whitespace-nowrap text-sm font-semibold">
                    {money(o.estimatedTotal.amountMinor, o.estimatedTotal.currency, locale)}
                  </p>
                ) : null}
              </div>
              <Link
                href={`/${locale}/vehicles/${o.categoryCode}?${new URLSearchParams({ pickup, pickupAt, returnAt }).toString()}`}
                className="mt-3 inline-block rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t.t('action.viewDetails')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
