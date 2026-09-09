import { stashReturnTo } from '@carrental/client';
import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import { AppStateView, Spinner } from '@carrental/ui';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/** Requires an authenticated session of the given audience; otherwise redirects to sign-in
 * while stashing the return target (FLOW-CUS-002, SRS-UI-006). */
export function RequireAuth({
  audience,
  children,
}: {
  audience: 'customer' | 'staff';
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { status, actor } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('guard.checkingSession')} />
      </div>
    );
  }

  if (status === 'anonymous' || !actor) {
    stashReturnTo(location.pathname + location.search);
    return <Navigate to="/sign-in" replace />;
  }

  if (actor.kind !== audience) {
    // wrong audience (e.g. a customer hitting /ops)
    return (
      <div className="mx-auto max-w-md p-8">
        <AppStateView
          kind="permission-denied"
          title={t('guard.staffOnly')}
          description={t('guard.staffOnlyBody')}
        />
      </div>
    );
  }

  return <>{children}</>;
}

/** Requires the staff actor to hold at least one of the listed permission actions. */
export function RequirePermission({
  anyOf,
  children,
  fallbackTitle,
}: {
  anyOf: string[];
  children: ReactNode;
  fallbackTitle?: string;
}) {
  const { t } = useI18n();
  const { hasPermission } = useAuth();
  const title = fallbackTitle ?? t('guard.noAccess');
  if (!hasPermission(...anyOf)) {
    return (
      <div className="mx-auto max-w-md p-8">
        <AppStateView
          kind="permission-denied"
          title={title}
          description={t('guard.noAccessBody')}
        />
      </div>
    );
  }
  return <>{children}</>;
}
