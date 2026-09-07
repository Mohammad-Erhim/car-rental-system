import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AccountShell } from '../../../components/account-shell';
import { RequireAuth } from '../../../components/require-auth';

/** The account area is private — never indexed. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AccountShell>{children}</AccountShell>
    </RequireAuth>
  );
}
