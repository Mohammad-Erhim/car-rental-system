import type { Metadata } from 'next';

import { SiteContainer } from '../../../components/site-container';
import { getT } from '../../../lib/i18n';
import { buildMetadata } from '../../../lib/seo';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getT(params.locale);
  return buildMetadata({
    locale: params.locale,
    path: '/help',
    title: `${t.t('nav.help')} — ${t.t('app.name')}`,
    description: t.t('site.help.metaDescription'),
  });
}

export default async function HelpPage({ params }: { params: { locale: string } }) {
  const t = await getT(params.locale);
  const faqs = ['booking', 'changes', 'payment', 'pickup'] as const;
  return (
    <SiteContainer size="md" className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-ink">{t.t('site.help.title')}</h1>
      <p className="text-ink-muted">{t.t('site.help.intro')}</p>
      <dl className="space-y-3">
        {faqs.map((f) => (
          <div key={f} className="surface-card p-5">
            <dt className="font-semibold text-ink">{t.t(`site.help.faq.${f}.q`)}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              {t.t(`site.help.faq.${f}.a`)}
            </dd>
          </div>
        ))}
      </dl>
    </SiteContainer>
  );
}
