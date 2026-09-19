import { useI18n } from '@carrental/i18n/react';
import { Building2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { isOrgWidePath, paths } from '@/app/paths';
import { StateView } from '@/components/state-view';
import { useLocationScope } from '@/lib/location-scope';

/**
 * An account limited to specific locations that opens an organisation-wide area (settings, website,
 * finance, audit…) — from a bookmark or a link — gets an explanation and a way back, not a page of
 * failed requests. The API enforces the same rule; this is the friendly face of it.
 */
export function OrgWideGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { restricted } = useLocationScope();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!restricted || !isOrgWidePath(pathname)) return <>{children}</>;
  return (
    <StateView
      icon={Building2}
      title={t('ops.scope.orgWideTitle')}
      description={t('ops.scope.orgWideBody')}
      actionLabel={t('ops.scope.backToDashboard')}
      onAction={() => navigate(paths.dashboard)}
      className="py-24"
      data-testid="org-wide-gate"
    />
  );
}
