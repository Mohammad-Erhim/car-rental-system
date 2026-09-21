import { useT } from '@carrental/i18n/react';
import { SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  createBrowserRouter,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useRouteError,
  type RouteObject,
} from 'react-router-dom';

import { RequireAuth, RequirePermission } from '../components/route-guards.js';
import { StateView } from '../components/state-view.js';
import { AccessPage } from '../features/access/access-page.js';
import { AuditLogPage } from '../features/audit/audit-page.js';
import { RecoveryPage } from '../features/auth/recovery-page.js';
import { SignInPage } from '../features/auth/sign-in-page.js';
import { BrandingPage } from '../features/branding/branding-page.js';
import { CategoriesPage } from '../features/categories/categories-page.js';
import { FeaturesPage } from '../features/categories/features-page.js';
import { ConsentLogPage } from '../features/consent/consent-log-page.js';
import { ConsentPage } from '../features/consent/consent-page.js';
import { CurrenciesPage } from '../features/currencies/currencies-page.js';
import { CustomerDetailPage } from '../features/customers/customer-detail-page.js';
import { CustomersPage } from '../features/customers/customers-page.js';
import { DashboardPage } from '../features/dashboard/dashboard-page.js';
import { DataQualityPage } from '../features/data-quality/data-quality-page.js';
import { EmailPage } from '../features/email/email-page.js';
import { FinancePage } from '../features/finance/finance-page.js';
import { FleetPage } from '../features/fleet/fleet-page.js';
import { LanguagesPage } from '../features/languages/languages-page.js';
import { LocationDetailPage } from '../features/locations/location-detail-page.js';
import { LocationsPage } from '../features/locations/locations-page.js';
import { MediaLibraryPage } from '../features/media/media-page.js';
import { OrganizationPage } from '../features/organization/organization-page.js';
import { PagesPage } from '../features/pages-builder/pages-page.js';
import { PaymentsPage } from '../features/payments/payments-page.js';
import { PolicyPage } from '../features/policy/policy-page.js';
import { ProductsPage } from '../features/products/products-page.js';
import { RatePlansPage } from '../features/rate-plans/rate-plans-page.js';
import { ReferenceDataPage } from '../features/reference-data/reference-data-page.js';
import { RentalDetailPage } from '../features/rentals/rental-detail-page.js';
import { RentalsPage } from '../features/rentals/rentals-page.js';
import { ReportsPage } from '../features/reports/reports-page.js';
import { ReservationDetailPage } from '../features/reservations/reservation-detail-page.js';
import { ReservationsPage } from '../features/reservations/reservations-page.js';
import { SearchPage } from '../features/search/search-page.js';
import { SeoPage } from '../features/seo/seo-page.js';
import { StaffPage } from '../features/staff/staff-page.js';
import { TemplatePage } from '../features/templates/template-page.js';
import { TemplatesPage } from '../features/templates/templates-page.js';
import { TranslationEditorPage } from '../features/translations/translation-editor-page.js';
import { TranslationsPage } from '../features/translations/translations-page.js';
import { BuilderPage } from '../features/workflows/builder-page.js';
import { RequestPage } from '../features/workflows/request-page.js';
import { TasksPage } from '../features/workflows/tasks-page.js';
import { WorkflowsAdminPage } from '../features/workflows/workflows-admin-page.js';
import { AuthLayout } from '../layouts/auth-layout.js';
import { DashboardLayout } from '../layouts/dashboard-layout.js';

import { fillPattern, LEGACY_REDIRECTS } from './paths.js';

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
      <StateView
        kind="error"
        title={t('route.error.title')}
        description={t('route.error.body')}
        actionLabel={t('route.goHome')}
        onAction={() => navigate('/')}
      />
    </div>
  );
}

function NotFound() {
  const navigate = useNavigate();
  const t = useT();
  return (
    <div className="mx-auto max-w-md p-8">
      <StateView
        icon={SearchX}
        title={t('route.notFound.title')}
        description={t('route.notFound.body')}
        actionLabel={t('route.goHome')}
        onAction={() => navigate('/')}
      />
    </div>
  );
}

/** Send an old address to its new home, carrying route params, the query string and the hash. */
function RedirectTo({ pattern }: { pattern: string }) {
  const params = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={`${fillPattern(pattern, params)}${search}${hash}`} replace />;
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
      path: 'settings/currencies',
      element: perm(['config.read', 'lookup.manage'], <CurrenciesPage />),
    },
    {
      path: 'settings/reference-data',
      element: perm(['config.read', 'lookup.manage'], <ReferenceDataPage />),
    },
    { path: 'admin/staff', element: perm(['staff.manage'], <StaffPage />) },
    { path: 'admin/access', element: perm(['staff.manage'], <AccessPage />) },
    {
      path: 'admin/workflows',
      element: perm(['workflow.manage', 'workflow.monitor'], <WorkflowsAdminPage />),
    },
    {
      path: 'admin/workflows/:id',
      element: perm(['workflow.manage', 'workflow.monitor'], <BuilderPage />),
    },
    { path: 'tasks', element: <TasksPage /> },
    { path: 'tasks/:id', element: <RequestPage /> },
    {
      path: 'customers',
      element: perm(['customer.read'], <CustomersPage />),
    },
    {
      path: 'customers/:id',
      element: perm(['customer.read'], <CustomerDetailPage />),
    },
    {
      path: 'website/translations',
      element: perm(['config.read', 'config.publish'], <TranslationsPage />),
    },
    {
      path: 'website/translations/:namespace/:locale',
      element: perm(['config.read', 'config.publish'], <TranslationEditorPage />),
    },
    {
      path: 'website/templates',
      element: perm(['config.read', 'config.publish'], <TemplatesPage />),
    },
    {
      path: 'website/templates/:key/:channel',
      element: perm(['config.read', 'config.publish'], <TemplatePage />),
    },
    {
      path: 'website/branding',
      element: perm(['config.read', 'config.publish'], <BrandingPage />),
    },
    {
      path: 'website/seo',
      element: perm(['config.read', 'config.publish'], <SeoPage />),
    },
    {
      path: 'website/pages',
      element: perm(['config.read', 'config.publish'], <PagesPage />),
    },
    {
      path: 'website/consent',
      element: perm(['config.read', 'config.publish'], <ConsentPage />),
    },
    { path: 'admin/consent-log', element: perm(['audit.read'], <ConsentLogPage />) },
    {
      path: 'website/languages',
      element: perm(['config.read', 'config.publish'], <LanguagesPage />),
    },
    {
      path: 'reservations',
      element: perm(['reservation.read', 'reservation.modify'], <ReservationsPage />),
    },
    {
      path: 'reservations/:reference',
      element: perm(['reservation.read', 'reservation.modify'], <ReservationDetailPage />),
    },
    { path: 'fleet', element: perm(['fleet.read', 'fleet.manage'], <FleetPage />) },
    {
      path: 'catalogue/rate-plans',
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
      path: 'website/media',
      element: perm(
        ['catalogue.read', 'catalogue.manage', 'fleet.read', 'fleet.manage', 'config.read'],
        <MediaLibraryPage />,
      ),
    },
    {
      path: 'catalogue/locations',
      element: perm(['config.read', 'config.publish'], <LocationsPage />),
    },
    {
      path: 'catalogue/locations/:code',
      element: perm(['config.read', 'config.publish'], <LocationDetailPage />),
    },
    {
      path: 'settings/organization',
      element: perm(['config.read', 'config.publish'], <OrganizationPage />),
    },
    {
      path: 'settings/integrations/payments',
      element: perm(['payment.manage'], <PaymentsPage />),
    },
    {
      path: 'settings/integrations/email',
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
      path: 'settings/policies',
      element: perm(['config.read', 'config.publish'], <PolicyPage />),
    },
    { path: 'reports', element: perm(['report.read'], <ReportsPage />) },
    { path: 'admin/audit', element: perm(['audit.read'], <AuditLogPage />) },
    {
      path: 'admin/data-quality',
      element: perm(['audit.read', 'config.read'], <DataQualityPage />),
    },
    // old addresses (bookmarks, emails, the audit trail) keep working
    ...LEGACY_REDIRECTS.map(([from, to]) => ({
      path: from.slice(1),
      element: <RedirectTo pattern={to} />,
    })),
  ];
}
