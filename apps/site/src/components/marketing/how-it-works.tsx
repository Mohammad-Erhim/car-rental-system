import { CarFront, ListChecks, Search } from 'lucide-react';

import { RouteDots } from './art';
import { Section, SectionHeading, type Translate } from './section';

const STEPS = [
  { Icon: Search, key: 'step1' },
  { Icon: ListChecks, key: 'step2' },
  { Icon: CarFront, key: 'step3' },
] as const;

/** Three-step explainer with a dotted route connecting the milestones. */
export function HowItWorks({ t }: { t: Translate }) {
  return (
    <Section className="mkt-section">
      <SectionHeading eyebrow={t('site.home.steps.eyebrow')} title={t('site.home.steps.title')} />
      <div className="relative mt-12">
        <RouteDots className="absolute inset-x-8 top-6 hidden h-3 text-hairline lg:block" />
        <ol className="relative grid gap-8 lg:grid-cols-3">
          {STEPS.map(({ Icon, key }, i) => (
            <li key={key} className="flex flex-col items-center text-center">
              <span className="relative flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
                <Icon className="size-6" aria-hidden="true" />
                <span className="absolute -end-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-warm text-xs font-bold text-warm-foreground">
                  {i + 1}
                </span>
              </span>
              <h3 className="mt-5 text-base font-semibold text-ink">
                {t(`site.home.steps.${key}.title`)}
              </h3>
              <p className="mt-1.5 max-w-xs text-sm text-ink-muted">
                {t(`site.home.steps.${key}.text`)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
