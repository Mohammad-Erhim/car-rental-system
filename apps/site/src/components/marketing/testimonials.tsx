import { Quote, Star } from 'lucide-react';

import { Section, SectionHeading, type Translate } from './section';

const REVIEWS = [{ key: 'r1' }, { key: 'r2' }, { key: 'r3' }] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Customer quotes with a rating row and an initials avatar. */
export function Testimonials({
  t,
  tone = 'muted',
  headingAs = 'h2',
  count = 3,
}: {
  t: Translate;
  tone?: 'default' | 'muted' | 'brand';
  headingAs?: 'h1' | 'h2';
  count?: number;
}) {
  return (
    <Section tone={tone} className="mkt-section">
      <SectionHeading
        as={headingAs}
        eyebrow={t('site.home.reviews.eyebrow')}
        title={t('site.home.reviews.title')}
      />
      <ul className="mt-10 grid gap-6 md:grid-cols-3">
        {REVIEWS.slice(0, Math.max(1, Math.min(count, 3))).map(({ key }) => {
          const name = t(`site.home.reviews.${key}.name`);
          return (
            <li
              key={key}
              className="surface-card relative flex h-full flex-col gap-4 overflow-hidden p-6"
            >
              <Quote
                className="pointer-events-none absolute -end-2 -top-3 size-20 text-brand/[0.07] rtl:-scale-x-100"
                aria-hidden="true"
              />
              <div className="flex items-center gap-0.5" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="size-4 fill-warm text-warm" />
                ))}
              </div>
              <p className="relative flex-1 text-sm leading-relaxed text-ink">
                {t(`site.home.reviews.${key}.quote`)}
              </p>
              <div className="flex items-center gap-3 border-t border-hairline pt-4">
                <span
                  className="flex size-10 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand"
                  aria-hidden="true"
                >
                  {initials(name)}
                </span>
                <span className="text-sm">
                  <span className="block font-semibold text-ink">{name}</span>
                  <span className="block text-ink-muted">{t(`site.home.reviews.${key}.role`)}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
