import { Gauge, Receipt, RefreshCw, ShieldCheck } from 'lucide-react';

import { Section, SectionHeading, type Translate } from './section';

const ITEMS = [
  { Icon: Receipt, key: 'item1' },
  { Icon: Gauge, key: 'item2' },
  { Icon: RefreshCw, key: 'item3' },
  { Icon: ShieldCheck, key: 'item4' },
] as const;

const COLS: Record<string, string> = {
  '2': 'lg:grid-cols-2',
  '3': 'lg:grid-cols-3',
  '4': 'lg:grid-cols-4',
};

/** Value-proposition grid — why book here rather than at the desk. */
export function WhyUs({
  t,
  tone = 'muted',
  headingAs = 'h2',
  columns = '4',
}: {
  t: Translate;
  tone?: 'default' | 'muted' | 'brand';
  headingAs?: 'h1' | 'h2';
  columns?: '2' | '3' | '4';
}) {
  return (
    <Section tone={tone} className="mkt-section">
      <SectionHeading
        as={headingAs}
        eyebrow={t('site.home.why.eyebrow')}
        title={t('site.home.why.title')}
        lead={t('site.home.why.subtitle')}
      />
      <ul className={`mt-10 grid gap-5 sm:grid-cols-2 ${COLS[columns] || 'lg:grid-cols-4'}`}>
        {ITEMS.map(({ Icon, key }) => (
          <li key={key} className="surface-card hover-lift h-full p-6">
            <span className="icon-chip" aria-hidden="true">
              <Icon className="size-5" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-ink">
              {t(`site.home.why.${key}.title`)}
            </h3>
            <p className="mt-1.5 text-sm text-ink-muted">{t(`site.home.why.${key}.text`)}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
