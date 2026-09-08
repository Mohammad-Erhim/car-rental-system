import { Section, type Translate } from './section';

/**
 * Brand-gradient stat band. `locationsCount` is real (from the locations API); the other figures
 * are copy — overridable per-block via `values`.
 */
export function StatsBand({
  t,
  locationsCount,
  tone = 'brand',
  headingAs = 'h2',
  values,
  autoLocations = true,
}: {
  t: Translate;
  locationsCount: number;
  tone?: 'default' | 'muted' | 'brand';
  headingAs?: 'h1' | 'h2';
  values?: Array<string | undefined>;
  autoLocations?: boolean;
}) {
  const Heading = headingAs;
  const locValue =
    autoLocations && !values?.[0]
      ? locationsCount >= 20
        ? `${locationsCount}+`
        : '120+'
      : values?.[0] || '120+';
  const stats = [
    { value: locValue, label: t('site.home.stats.locations') },
    { value: values?.[1] || '8,500+', label: t('site.home.stats.vehicles') },
    { value: values?.[2] || '30+', label: t('site.home.stats.countries') },
    { value: values?.[3] || '4.9/5', label: t('site.home.stats.rating') },
  ];

  return (
    <Section tone={tone} className="mkt-section-tight">
      <Heading className="text-center text-xl font-semibold text-brand-foreground sm:text-2xl">
        {t('site.home.stats.title')}
      </Heading>
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
