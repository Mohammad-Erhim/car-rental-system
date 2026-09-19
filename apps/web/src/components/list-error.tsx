import { ApiError } from '@carrental/client';
import { useI18n } from '@carrental/i18n/react';
import { ShieldAlert } from 'lucide-react';

import { StateView } from '@/components/state-view';
import { useLocationScope } from '@/lib/location-scope';

/**
 * The error state of a branch-aware list. A 403 here means the location filter names a branch this
 * account may not see (the API says exactly which) — retrying can't help, so offer the way out
 * ("show all my locations") instead of a generic "couldn't load".
 */
export function ListError({
  error,
  title,
  onRetry,
}: {
  error: unknown;
  /** what failed to load, e.g. "Couldn't load reservations" */
  title: string;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const { clear, retry } = useLocationScope();
  if (error instanceof ApiError && error.status === 403) {
    return (
      <StateView
        kind="error"
        icon={ShieldAlert}
        title={t('ops.locFilter.forbiddenTitle')}
        description={error.message || t('ops.locFilter.forbiddenBody')}
        actionLabel={t('ops.locFilter.showAllMine')}
        onAction={() => {
          retry(); // the account's scope may have changed since the options were fetched
          clear();
        }}
        className="py-14"
      />
    );
  }
  return (
    <StateView
      kind="error"
      title={title}
      description={t('state.failure.body')}
      actionLabel={t('ops.st.retry')}
      onAction={onRetry}
      className="py-14"
    />
  );
}
