import { AppStateView } from '@carrental/ui';
import type { ReactNode } from 'react';
import { createBrowserRouter, useNavigate, useRouteError } from 'react-router-dom';

import { RequireAuth, RequirePermission } from '../components/route-guards.js';
import { RecoveryPage } from '../surfaces/auth/recovery-page.js';
import { RegisterPage } from '../surfaces/auth/register-page.js';
import { SignInPage } from '../surfaces/auth/sign-in-page.js';
import { AccountOverviewPage } from '../surfaces/customer/account-overview-page.js';
import { CheckoutPage } from '../surfaces/customer/checkout-page.js';
import { CustomerLayout } from '../surfaces/customer/customer-layout.js';
import { DataRequestsPage } from '../surfaces/customer/data-requests-page.js';
import { DriversPage } from '../surfaces/customer/drivers-page.js';
import { HomePage } from '../surfaces/customer/home-page.js';
import { PlaceholderPage } from '../surfaces/customer/placeholder-page.js';
import { ProfilePage } from '../surfaces/customer/profile-page.js';
import { ReservationDetailPage } from '../surfaces/customer/reservation-detail-page.js';
import { SearchResultsPage } from '../surfaces/customer/search-results-page.js';
import { TripsPage } from '../surfaces/customer/trips-page.js';
import { VehicleDetailPage } from '../surfaces/customer/vehicle-detail-page.js';
import { AuditLogPage } from '../surfaces/ops/audit-log-page.js';
import { ConfigVersionsPage } from '../surfaces/ops/config-versions-page.js';
import { FleetInventoryPage } from '../surfaces/ops/fleet-inventory-page.js';
import { OpsDashboard } from '../surfaces/ops/ops-dashboard.js';
import { OpsLayout } from '../surfaces/ops/ops-layout.js';
import { OpsPlaceholder } from '../surfaces/ops/ops-placeholder.js';
import { RatePlansPage } from '../surfaces/ops/rate-plans-page.js';
import { ReferenceDataPage } from '../surfaces/ops/reference-data-page.js';
import { RentalBoardPage } from '../surfaces/ops/rental-board-page.js';
import { ReportsPage } from '../surfaces/ops/reports-page.js';
import { ReservationQueuePage } from '../surfaces/ops/reservation-queue-page.js';
import { StaffRolesPage } from '../surfaces/ops/staff-roles-page.js';
import { TranslationsPage } from '../surfaces/ops/translations-page.js';

function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();

  console.error('Route error', error);
  return (
    <div className="mx-auto max-w-md p-8">
      <AppStateView
        kind="failure"
        title="This page failed to load"
        description="Nothing was changed."
        primaryAction={{ label: 'Go home', onClick: () => navigate('/') }}
      />
    </div>
  );
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-md p-8">
      <AppStateView
        kind="no-results"
        title="Page not found"
        description="The page you asked for doesn’t exist."
        primaryAction={{ label: 'Go home', onClick: () => navigate('/') }}
      />
    </div>
  );
}

const cust = (el: ReactNode) => <RequireAuth audience="customer">{el}</RequireAuth>;
const staffOnly = (el: ReactNode) => <RequireAuth audience="staff">{el}</RequireAuth>;

export const router = createBrowserRouter([
  {
    path: '/',
    element: <CustomerLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'search', element: <SearchResultsPage /> },
      { path: 'vehicle/:categoryCode', element: <VehicleDetailPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'sign-in', element: <SignInPage audience="customer" /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'recovery', element: <RecoveryPage audience="customer" /> },
      { path: 'account', element: cust(<AccountOverviewPage />) },
      { path: 'account/profile', element: cust(<ProfilePage />) },
      { path: 'account/drivers', element: cust(<DriversPage />) },
      {
        path: 'account/payments',
        element: cust(
          <PlaceholderPage
            title="Payments & receipts"
            note="Payment history appears once booking & payments are implemented."
          />,
        ),
      },
      { path: 'account/data', element: cust(<DataRequestsPage />) },
      { path: 'trips', element: <TripsPage /> },
      { path: 'trips/:reference', element: cust(<ReservationDetailPage />) },
      {
        path: 'help',
        element: (
          <PlaceholderPage
            title="Help"
            note="Support routes and contextual help content are configured in the admin stage."
          />
        ),
      },
    ],
  },
  {
    path: '/ops',
    element: <OpsLayout />,
    errorElement: <RouteError />,
    children: [
      { path: 'sign-in', element: <SignInPage audience="staff" /> },
      { path: 'recovery', element: <RecoveryPage audience="staff" /> },
      { index: true, element: staffOnly(<OpsDashboard />) },
      {
        path: 'config/reference-data',
        element: staffOnly(
          <RequirePermission anyOf={['config.read', 'lookup.manage']}>
            <ReferenceDataPage />
          </RequirePermission>,
        ),
      },
      {
        path: 'admin/staff',
        element: staffOnly(
          <RequirePermission
            anyOf={['staff.manage']}
            fallbackTitle="Staff administration requires the staff.manage permission"
          >
            <StaffRolesPage />
          </RequirePermission>,
        ),
      },
      {
        path: 'config/translations',
        element: staffOnly(
          <RequirePermission anyOf={['config.read', 'config.publish']}>
            <TranslationsPage />
          </RequirePermission>,
        ),
      },
      {
        path: 'work',
        element: staffOnly(
          <RequirePermission anyOf={['reservation.read', 'reservation.modify']}>
            <ReservationQueuePage />
          </RequirePermission>,
        ),
      },
      {
        path: 'fleet',
        element: staffOnly(
          <RequirePermission anyOf={['fleet.read', 'fleet.manage']}>
            <FleetInventoryPage />
          </RequirePermission>,
        ),
      },
      {
        path: 'config/rate-plans',
        element: staffOnly(
          <RequirePermission anyOf={['config.read', 'config.publish']}>
            <RatePlansPage />
          </RequirePermission>,
        ),
      },
      {
        path: 'rentals',
        element: staffOnly(
          <RequirePermission anyOf={['rental.read', 'rental.pickup', 'rental.return']}>
            <RentalBoardPage />
          </RequirePermission>,
        ),
      },
      {
        path: 'finance',
        element: staffOnly(
          <OpsPlaceholder
            title="Finance"
            note="Payments & reconciliation (SCREEN-OPS-023/024) land in the reservation-operations stage."
          />,
        ),
      },
      {
        path: 'config',
        element: staffOnly(
          <RequirePermission anyOf={['config.read', 'config.publish']}>
            <ConfigVersionsPage />
          </RequirePermission>,
        ),
      },
      {
        path: 'insights',
        element: staffOnly(
          <RequirePermission anyOf={['report.read']}>
            <ReportsPage />
          </RequirePermission>,
        ),
      },
      {
        path: 'audit',
        element: staffOnly(
          <RequirePermission
            anyOf={['audit.read']}
            fallbackTitle="The audit log requires the audit.read permission"
          >
            <AuditLogPage />
          </RequirePermission>,
        ),
      },
    ],
  },
  { path: '*', element: <NotFound /> },
]);
