import { AppStateView, Spinner } from '@carrental/ui';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../lib/auth.js';
import { stashReturnTo } from '../lib/return-to.js';

/** Requires an authenticated session of the given audience; otherwise redirects to sign-in
 * while stashing the return target (FLOW-CUS-002, SRS-UI-006). */
export function RequireAuth({
  audience,
  children,
}: {
  audience: 'customer' | 'staff';
  children: ReactNode;
}) {
  const { status, actor } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Checking your session" />
      </div>
    );
  }

  if (status === 'anonymous' || !actor) {
    stashReturnTo(location.pathname + location.search);
    return <Navigate to={audience === 'staff' ? '/ops/sign-in' : '/sign-in'} replace />;
  }

  if (actor.kind !== audience) {
    // wrong audience (e.g. a customer hitting /ops)
    return (
      <div className="mx-auto max-w-md p-8">
        <AppStateView
          kind="permission-denied"
          title="This area is for staff"
          description="Your account does not have access here."
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
  fallbackTitle = 'You don’t have access to this',
}: {
  anyOf: string[];
  children: ReactNode;
  fallbackTitle?: string;
}) {
  const { hasPermission } = useAuth();
  if (!hasPermission(...anyOf)) {
    return (
      <div className="mx-auto max-w-md p-8">
        <AppStateView
          kind="permission-denied"
          title={fallbackTitle}
          description="Ask an administrator if you think this is wrong."
        />
      </div>
    );
  }
  return <>{children}</>;
}
