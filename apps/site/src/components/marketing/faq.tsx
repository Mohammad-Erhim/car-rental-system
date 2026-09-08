import { ChevronDown, LifeBuoy } from 'lucide-react';
import Link from 'next/link';

import { Section, SectionHeading, type Translate } from './section';

const KEYS = ['booking', 'changes', 'payment', 'pickup'] as const;

/** FAQ built on native <details> — keyboard-operable and open-by-default-friendly, no JS. */
export function Faq({
  t,
  locale,
  tone = 'muted',
  headingAs = 'h2',
}: {
  t: Translate;
  locale: string;
  tone?: 'default' | 'muted' | 'brand';
  headingAs?: 'h1' | 'h2';
}) {
  return (
    <Section tone={tone} className="mkt-section">
      <SectionHeading
        as={headingAs}
        eyebrow={t('site.home.faq.eyebrow')}
        title={t('site.home.faq.title')}
      />

      <div className="mx-auto mt-10 max-w-3xl divide-y divide-hairline overflow-hidden surface-card">
        {KEYS.map((k) => (
          <details key={k} className="faq-item group">
            <summary className="flex items-center justify-between gap-4 p-5 text-start text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset">
              {t(`site.help.faq.${k}.q`)}
              <ChevronDown
                className="faq-chevron size-5 shrink-0 text-ink-muted"
                aria-hidden="true"
              />
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-ink-muted">
              {t(`site.help.faq.${k}.a`)}
            </p>
          </details>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link
          href={`/${locale}/help`}
          className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-surface px-5 py-2.5 text-sm font-semibold text-ink hover-lift"
        >
          <LifeBuoy className="size-4 text-brand" aria-hidden="true" />
          {t('site.home.faq.cta')}
        </Link>
      </div>
    </Section>
  );
}
