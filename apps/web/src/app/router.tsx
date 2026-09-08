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
import { CustomersPage } from '../surfaces/ops/customers-page.js';
import { DataQualityPage } from '../surfaces/ops/data-quality-page.js';
import { FinanceCasesPage } from '../surfaces/ops/finance-cases-page.js';
import { FleetInventoryPage } from '../surfaces/ops/fleet-inventory-page.js';
import { LanguagesPage } from '../surfaces/ops/languages-page.js';
import { LocationsPage } from '../surfaces/ops/locations-page.js';
import { OpsDashboard } from '../surfaces/ops/ops-dashboard.js';
import { OpsLayout } from '../surfaces/ops/ops-layout.js';
import { PagesPage } from '../surfaces/ops/pages-builder/pages-page.js';
import { ProductsPage } from '../surfaces/ops/products-page.js';
import { RatePlansPage } from '../surfaces/ops/rate-plans-page.js';
import { ReferenceDataPage } from '../surfaces/ops/reference-data-page.js';
import { RentalBoardPage } from '../surfaces/ops/rental-board-page.js';
import { ReportsPage } from '../surfaces/ops/reports-page.js';
import { ReservationQueuePage } from '../surfaces/ops/reservation-queue-page.js';
import { SearchPage } from '../surfaces/ops/search-page.js';
import { SeoPage } from '../surfaces/ops/seo-page.js';
import { StaffRolesPage } from '../surfaces/ops/staff-roles-page.js';
import { TemplatesPage } from '../surfaces/ops/templates-page.js';
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
          path: 'search',
          element: perm(['reservation.read', 'rental.read'], <SearchPage />),
        },
        {
          path: 'config/reference-data',
          element: perm(['config.read', 'lookup.manage'], <ReferenceDataPage />),
        },
        { path: 'admin/staff', element: perm(['staff.manage'], <StaffRolesPage />) },
        {
          path: 'customers',
          element: perm(['customer.read'], <CustomersPage />),
        },
        {
          path: 'config/translations',
          element: perm(['config.read', 'config.publish'], <TranslationsPage />),
        },
        {
          path: 'config/templates',
          element: perm(['config.read', 'config.publish'], <TemplatesPage />),
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
          path: 'config/pages',
          element: perm(['config.read', 'config.publish'], <PagesPage />),
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
          path: 'catalogue/products',
          element: perm(['catalogue.read', 'catalogue.manage', 'config.read'], <ProductsPage />),
        },
        {
          path: 'config/locations',
          element: perm(['config.read', 'config.publish'], <LocationsPage />),
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
        {
          path: 'data-quality',
          element: perm(['audit.read', 'config.read'], <DataQualityPage />),
        },
      ],
    },
    { path: '*', element: <NotFound /> },
  ],
  { basename: '/ops' },
);
