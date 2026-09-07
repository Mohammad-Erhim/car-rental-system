import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AccountShell } from '../../../components/account-shell';
import { RequireAuth } from '../../../components/require-auth';
import { getT } from '../../../lib/i18n';

/** The account area is private — never indexed. */
export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getT(params.locale);
  return {
    title: `${t.t('account.title')} — ${t.t('app.name')}`,
    robots: { index: false, follow: false },
  };
}

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AccountShell>{children}</AccountShell>
    </RequireAuth>
  );
}
