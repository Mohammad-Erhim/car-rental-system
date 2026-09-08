import { Section, type Translate } from './section';

/**
 * Brand-gradient stat band. `locationsCount` is real (from the locations API); the rest are
 * network-level figures from marketing copy.
 */
export function StatsBand({ t, locationsCount }: { t: Translate; locationsCount: number }) {
  const stats = [
    {
      value: locationsCount >= 20 ? `${locationsCount}+` : '120+',
      label: t('site.home.stats.locations'),
    },
    { value: '8,500+', label: t('site.home.stats.vehicles') },
    { value: '30+', label: t('site.home.stats.countries') },
    { value: '4.9/5', label: t('site.home.stats.rating') },
  ];

  return (
    <Section tone="brand" className="mkt-section-tight">
      <h2 className="text-center text-xl font-semibold text-brand-foreground sm:text-2xl">
        {t('site.home.stats.title')}
      </h2>
      <dl className="mt-10 grid grid-cols-2 gap-8 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <dt className="sr-only">{s.label}</dt>
            <dd>
              <span className="block text-3xl font-extrabold tracking-tight text-brand-foreground sm:text-4xl">
                {s.value}
              </span>
              <span className="mt-1 block text-sm text-brand-foreground/90">{s.label}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
