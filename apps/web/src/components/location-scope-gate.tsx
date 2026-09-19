import { useI18n } from '@carrental/i18n/react';
import type { ReactNode } from 'react';

import { StateView } from '@/components/state-view';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocationScope } from '@/lib/location-scope';

/**
 * Holds a branch-aware page until the location filter is settled — the account's locations have
 * loaded and the URL carries the (valid) selection — so the page never fires a request for a scope
 * that is about to change, or that the account may not see. Other pages render straight through.
 */
export function LocationScopeGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { scopedPage, ready, error, retry } = useLocationScope();
  if (!scopedPage) return <>{children}</>;
  if (error) {
    return (
      <StateView
        kind="error"
        title={t('ops.locFilter.optionsFail')}
        description={t('state.failure.body')}
        actionLabel={t('ops.st.retry')}
        onAction={retry}
        className="py-24"
      />
    );
  }
  if (!ready) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return <>{children}</>;
}
