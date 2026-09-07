import { useT } from '@carrental/i18n/react';
import { AppStateView } from '@carrental/ui';
import type { ReactNode } from 'react';
import { createBrowserRouter, useNavigate, useRouteError } from 'react-router-dom';

import { RequireAuth, RequirePermission } from '../components/route-guards.js';
import { RecoveryPage } from '../surfaces/auth/recovery-page.js';
import { SignInPage } from '../surfaces/auth/sign-in-page.js';
import { AuditLogPage } from '../surfaces/ops/audit-log-page.js';
import { BrandingPage } from '../surfaces/ops/branding-page.js';
import { ConfigVersionsPage } from '../surfaces/ops/config-versions-page.js';
import { FinanceCasesPage } from '../surfaces/ops/finance-cases-page.js';
import { FleetInventoryPage } from '../surfaces/ops/fleet-inventory-page.js';
import { LanguagesPage } from '../surfaces/ops/languages-page.js';
import { OpsDashboard } from '../surfaces/ops/ops-dashboard.js';
import { OpsLayout } from '../surfaces/ops/ops-layout.js';
import { RatePlansPage } from '../surfaces/ops/rate-plans-page.js';
import { ReferenceDataPage } from '../surfaces/ops/reference-data-page.js';
import { RentalBoardPage } from '../surfaces/ops/rental-board-page.js';
import { ReportsPage } from '../surfaces/ops/reports-page.js';
import { ReservationQueuePage } from '../surfaces/ops/reservation-queue-page.js';
import { SeoPage } from '../surfaces/ops/seo-page.js';
import { StaffRolesPage } from '../surfaces/ops/staff-roles-page.js';
import { TranslationsPage } from '../surfaces/ops/translations-page.js';

/**
 * `apps/web` is the Operations & Admin dashboard only (DEC-023 — the customer surface is
 * `apps/site`). Served under `/ops` via the Vite `base` + this router `basename`.
 */
function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const t = useT();
  console.error('Route error', error);
  return (
    <div className="mx-auto max-w-md p-8">
      <AppStateView
        kind="failure"
        title={t('route.error.title')}
        description={t('route.error.body')}
        primaryAction={{ label: t('route.goHome'), onClick: () => navigate('/') }}
      />
    </div>
  );
}

function NotFound() {
  const navigate = useNavigate();
  const t = useT();
  return (
    <div className="mx-auto max-w-md p-8">
      <AppStateView
        kind="no-results"
        title={t('route.notFound.title')}
        description={t('route.notFound.body')}
        primaryAction={{ label: t('route.goHome'), onClick: () => navigate('/') }}
      />
    </div>
  );
}

const staffOnly = (el: ReactNode) => <RequireAuth audience="staff">{el}</RequireAuth>;
const perm = (anyOf: string[], el: ReactNode, fallbackTitle?: string) =>
  staffOnly(
    <RequirePermission anyOf={anyOf} fallbackTitle={fallbackTitle}>
      {el}
    </RequirePermission>,
  );

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <OpsLayout />,
      errorElement: <RouteError />,
      children: [
        { path: 'sign-in', element: <SignInPage audience="staff" /> },
        { path: 'recovery', element: <RecoveryPage audience="staff" /> },
        { index: true, element: staffOnly(<OpsDashboard />) },
        {
          path: 'config/reference-data',
          element: perm(['config.read', 'lookup.manage'], <ReferenceDataPage />),
        },
        { path: 'admin/staff', element: perm(['staff.manage'], <StaffRolesPage />) },
        {
          path: 'config/translations',
          element: perm(['config.read', 'config.publish'], <TranslationsPage />),
        },
        {
          path: 'config/branding',
          element: perm(['config.read', 'config.publish'], <BrandingPage />),
        },
        {
          path: 'config/seo',
          element: perm(['config.read', 'config.publish'], <SeoPage />),
        },
        {
          path: 'config/languages',
          element: perm(['config.read', 'config.publish'], <LanguagesPage />),
        },
        {
          path: 'work',
          element: perm(['reservation.read', 'reservation.modify'], <ReservationQueuePage />),
        },
        { path: 'fleet', element: perm(['fleet.read', 'fleet.manage'], <FleetInventoryPage />) },
        {
          path: 'config/rate-plans',
          element: perm(['config.read', 'config.publish'], <RatePlansPage />),
        },
        {
          path: 'rentals',
          element: perm(['rental.read', 'rental.pickup', 'rental.return'], <RentalBoardPage />),
        },
        {
          path: 'finance',
          element: perm(['payment.read', 'payment.reconcile'], <FinanceCasesPage />),
        },
        {
          path: 'config',
          element: perm(['config.read', 'config.publish'], <ConfigVersionsPage />),
        },
        { path: 'insights', element: perm(['report.read'], <ReportsPage />) },
        { path: 'audit', element: perm(['audit.read'], <AuditLogPage />) },
      ],
    },
    { path: '*', element: <NotFound /> },
  ],
  { basename: '/ops' },
);
