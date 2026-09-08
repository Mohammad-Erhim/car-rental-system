import { ArrowRight, Briefcase, Cog, Users } from 'lucide-react';
import Link from 'next/link';

import { CarArt, carVariantFor } from './art';
import { Section, SectionHeading, type Translate } from './section';

export interface FleetCategory {
  code: string;
  displayName: string;
  description: string | null;
  passengers: number;
  luggage: number;
  transmission: string;
}

/** Upgraded "browse by category": each fleet class as a picture card with specs and a CTA. */
export function FleetShowcase({
  t,
  locale,
  categories,
  tone = 'default',
  headingAs = 'h2',
}: {
  t: Translate;
  locale: string;
  categories: FleetCategory[];
  tone?: 'default' | 'muted' | 'brand';
  headingAs?: 'h1' | 'h2';
}) {
  return (
    <Section id="fleet" tone={tone} className="mkt-section scroll-anchor">
      <SectionHeading
        as={headingAs}
        eyebrow={t('site.home.fleet.eyebrow')}
        title={t('site.home.fleet.title')}
        lead={t('site.home.fleet.subtitle')}
      />

      {categories.length === 0 ? (
        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-hairline bg-surface-muted p-8 text-center">
          <p className="font-semibold text-ink">{t('site.home.fleet.emptyTitle')}</p>
          <p className="mt-1 text-sm text-ink-muted">{t('site.home.fleet.emptyText')}</p>
        </div>
      ) : (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <li key={c.code}>
              <Link
                href={`/${locale}/vehicles/${c.code}`}
                className="group flex h-full flex-col overflow-hidden surface-card hover-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <div className="relative isolate flex aspect-[16/9] items-end justify-center overflow-hidden bg-brand-gradient">
                  <span className="dot-grid absolute inset-0 opacity-20" aria-hidden="true" />
                  <span className="absolute end-3 top-3 rounded-full bg-brand-foreground/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-foreground backdrop-blur">
                    {c.displayName}
                  </span>
                  <CarArt
                    variant={carVariantFor(c.code)}
                    className="art-shadow relative w-[78%] text-brand-foreground transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                </div>

                <div className="flex flex-1 flex-col gap-3 p-5">
                  <h3 className="text-base font-semibold text-ink">{c.displayName}</h3>
                  <p className="line-clamp-2 flex-1 text-sm text-ink-muted">
                    {c.description ?? ''}
                  </p>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                    <div className="inline-flex items-center gap-1.5">
                      <Users className="size-3.5 text-brand" aria-hidden="true" />
                      <dt className="sr-only">{t('site.vehicle.passengers')}</dt>
                      <dd>{t('site.home.fleet.seatsShort', { n: c.passengers })}</dd>
                    </div>
                    <div className="inline-flex items-center gap-1.5">
                      <Briefcase className="size-3.5 text-brand" aria-hidden="true" />
                      <dt className="sr-only">{t('site.vehicle.luggage')}</dt>
                      <dd>{t('site.home.fleet.bagsShort', { n: c.luggage })}</dd>
                    </div>
                    <div className="inline-flex items-center gap-1.5">
                      <Cog className="size-3.5 text-brand" aria-hidden="true" />
                      <dt className="sr-only">{t('site.vehicle.transmissionLabel')}</dt>
                      <dd>{t(`site.vehicle.transmission.${c.transmission}`)}</dd>
                    </div>
                  </dl>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
                    {t('site.home.fleet.cta')}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
                      aria-hidden="true"
                    />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
