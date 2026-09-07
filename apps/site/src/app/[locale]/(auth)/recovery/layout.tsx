import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { getT } from '../../../../lib/i18n';

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getT(params.locale);
  return {
    title: `${t.t('auth.recoverTitle')} — ${t.t('app.name')}`,
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
