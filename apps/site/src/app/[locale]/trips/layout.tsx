import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { getT } from '../../../lib/i18n';

/** A customer's own trips are private — never indexed. */
export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getT(params.locale);
  return {
    title: `${t.t('trips.title')} — ${t.t('app.name')}`,
    robots: { index: false, follow: false },
  };
}

export default function TripsLayout({ children }: { children: ReactNode }) {
  return children;
}
