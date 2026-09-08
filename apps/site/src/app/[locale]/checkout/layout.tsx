import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { SiteContainer } from '../../../components/site-container';
import { getT } from '../../../lib/i18n';

/** Checkout carries a held quote and personal details — never indexed. */
export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getT(params.locale);
  return {
    title: `${t.t('checkout.title')} — ${t.t('app.name')}`,
    robots: { index: false, follow: false },
  };
}

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return <SiteContainer>{children}</SiteContainer>;
}
