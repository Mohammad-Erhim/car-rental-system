import { useT } from '@carrental/i18n/react';
import { AppStateView } from '@carrental/ui';
import type { ReactNode } from 'react';
import {
  createBrowserRouter,
  useNavigate,
  useRouteError,
  type RouteObject,
} from 'react-router-dom';

import { RequireAuth, RequirePermission } from '../components/route-guards.js';
import { RecoveryPage } from '../features/auth/recovery-page.js';
import { SignInPage } from '../features/auth/sign-in-page.js';
import { CategoriesPage } from '../features/categories/categories-page.js';
import { FeaturesPage } from '../features/categories/features-page.js';
import { CustomerDetailPage } from '../features/customers/customer-detail-page.js';
import { CustomersPage } from '../features/customers/customers-page.js';
import { DashboardPage } from '../features/dashboard/dashboard-page.js';
import { FinancePage } from '../features/finance/finance-page.js';
import { FleetPage } from '../features/fleet/fleet-page.js';
import { MediaLibraryPage } from '../features/media/media-page.js';
import { ProductsPage } from '../features/products/products-page.js';
import { RatePlansPage } from '../features/rate-plans/rate-plans-page.js';
import { ReferenceDataPage } from '../features/reference-data/reference-data-page.js';
import { RentalDetailPage } from '../features/rentals/rental-detail-page.js';
import { RentalsPage } from '../features/rentals/rentals-page.js';
import { ReservationDetailPage } from '../features/reservations/reservation-detail-page.js';
import { ReservationsPage } from '../features/reservations/reservations-page.js';
import { SearchPage } from '../features/search/search-page.js';
import { AuthLayout } from '../layouts/auth-layout.js';
import { DashboardLayout } from '../layouts/dashboard-layout.js';
import { AuditLogPage } from '../surfaces/ops/audit-log-page.js';
import { BrandingPage } from '../surfaces/ops/branding-page.js';
import { ConfigVersionsPage } from '../surfaces/ops/config-versions-page.js';
import { ConsentLogPage } from '../surfaces/ops/consent/consent-log-page.js';
import { ConsentPage } from '../surfaces/ops/consent/consent-page.js';
import { DataQualityPage } from '../surfaces/ops/data-quality-page.js';
import { EmailPage } from '../surfaces/ops/email-page.js';
import { LanguagesPage } from '../surfaces/ops/languages-page.js';
import { LocationsPage } from '../surfaces/ops/locations-page.js';
import { OrganizationPage } from '../surfaces/ops/organization-page.js';
import { PagesPage } from '../surfaces/ops/pages-builder/pages-page.js';
import { PaymentsPage } from '../surfaces/ops/payments-page.js';
import { ReportsPage } from '../surfaces/ops/reports-page.js';
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

const perm = (anyOf: string[], el: ReactNode, fallbackTitle?: string) => (
  <RequirePermission anyOf={anyOf} fallbackTitle={fallbackTitle}>
    {el}
  </RequirePermission>
);

export const router = createBrowserRouter(
  [
    {
      path: '/',
      errorElement: <RouteError />,
      children: [
        // signed-out screens: branded two-column shell, no sidebar
        {
          element: <AuthLayout />,
          children: [
            { path: 'sign-in', element: <SignInPage /> },
            { path: 'recovery', element: <RecoveryPage /> },
            { path: 'register', element: <RecoveryPage mode="activate" /> },
          ],
        },
        // everything else needs a signed-in staff session and gets the dashboard shell
        {
          element: (
            <RequireAuth audience="staff">
              <DashboardLayout />
            </RequireAuth>
          ),
          children: dashboardRoutes(),
        },
      ],
    },
    { path: '*', element: <NotFound /> },
  ],
  { basename: '/ops' },
);

function dashboardRoutes(): RouteObject[] {
  return [
    { index: true, element: <DashboardPage /> },
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
      path: 'customers/:id',
      element: perm(['customer.read'], <CustomerDetailPage />),
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
      path: 'config/consent',
      element: perm(['config.read', 'config.publish'], <ConsentPage />),
    },
    { path: 'consent-log', element: perm(['audit.read'], <ConsentLogPage />) },
    {
      path: 'config/languages',
      element: perm(['config.read', 'config.publish'], <LanguagesPage />),
    },
    {
      path: 'work',
      element: perm(['reservation.read', 'reservation.modify'], <ReservationsPage />),
    },
    {
      path: 'work/:reference',
      element: perm(['reservation.read', 'reservation.modify'], <ReservationDetailPage />),
    },
    { path: 'fleet', element: perm(['fleet.read', 'fleet.manage'], <FleetPage />) },
    {
      path: 'config/rate-plans',
      element: perm(['config.read', 'config.publish'], <RatePlansPage />),
    },
    {
      path: 'catalogue/categories',
      element: perm(['catalogue.read', 'catalogue.manage'], <CategoriesPage />),
    },
    {
      path: 'catalogue/categories/features',
      element: perm(['catalogue.read', 'catalogue.manage', 'config.read'], <FeaturesPage />),
    },
    {
      path: 'catalogue/products',
      element: perm(['catalogue.read', 'catalogue.manage', 'config.read'], <ProductsPage />),
    },
    {
      path: 'catalogue/media',
      element: perm(
        ['catalogue.read', 'catalogue.manage', 'fleet.read', 'fleet.manage', 'config.read'],
        <MediaLibraryPage />,
      ),
    },
    {
      path: 'config/locations',
      element: perm(['config.read', 'config.publish'], <LocationsPage />),
    },
    {
      path: 'config/organization',
      element: perm(['config.read', 'config.publish'], <OrganizationPage />),
    },
    {
      path: 'config/payments',
      element: perm(['payment.manage'], <PaymentsPage />),
    },
    {
      path: 'config/email',
      element: perm(['email.manage'], <EmailPage />),
    },
    {
      path: 'rentals',
      element: perm(['rental.read', 'rental.pickup', 'rental.return'], <RentalsPage />),
    },
    {
      path: 'rentals/:reference',
      element: perm(['rental.read', 'rental.pickup', 'rental.return'], <RentalDetailPage />),
    },
    {
      path: 'finance',
      element: perm(['payment.read', 'payment.reconcile'], <FinancePage />),
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
  ];
}
