import { ArrowUpRight, MapPin } from 'lucide-react';
import Link from 'next/link';

import { Section, SectionHeading, type Translate } from './section';

export interface LocationItem {
  code: string;
  name: string;
}

const LG_COLS: Record<number, string> = {
  1: 'lg:grid-cols-2',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
};

/** Popular pickup points, linking straight into a pre-filled search. Hidden when none load. */
export function LocationsStrip({
  t,
  locale,
  locations,
  tone = 'default',
  headingAs = 'h2',
  limit = 8,
}: {
  t: Translate;
  locale: string;
  locations: LocationItem[];
  tone?: 'default' | 'muted' | 'brand';
  headingAs?: 'h1' | 'h2';
  limit?: number;
}) {
  if (!locations.length) return null;
  const shown = locations.slice(0, Math.max(1, limit));
  const lgCols = LG_COLS[Math.min(shown.length, 4)] ?? 'lg:grid-cols-4';

  return (
    <Section tone={tone} className="mkt-section-tight">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading
          as={headingAs}
          align="start"
          eyebrow={t('site.home.locations.eyebrow')}
          title={t('site.home.locations.title')}
          lead={t('site.home.locations.subtitle')}
        />
        <Link
          href={`/${locale}/locations`}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
        >
          {t('site.home.locations.cta')}
          <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Link>
      </div>

      <ul className={`mt-6 grid gap-3 sm:grid-cols-2 ${lgCols}`}>
        {shown.map((l) => (
          <li key={l.code}>
            <Link
              href={`/${locale}/search?pickup=${encodeURIComponent(l.code)}`}
              className="group flex h-full items-center gap-3 rounded-2xl border border-hairline bg-surface p-4 hover-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <span className="icon-chip shrink-0" aria-hidden="true">
                <MapPin className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-snug text-ink">{l.name}</span>
                <span className="mt-0.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  {l.code}
                </span>
              </span>
              <ArrowUpRight
                className="ms-auto size-4 shrink-0 text-ink-muted transition-colors group-hover:text-brand rtl:-scale-x-100"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
