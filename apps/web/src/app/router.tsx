import { AppStateView } from '@carrental/ui';
import { createBrowserRouter, useNavigate, useRouteError } from 'react-router-dom';

import { CustomerLayout } from '../surfaces/customer/customer-layout.js';
import { HomePage } from '../surfaces/customer/home-page.js';
import { PlaceholderPage } from '../surfaces/customer/placeholder-page.js';
import { OpsDashboard } from '../surfaces/ops/ops-dashboard.js';
import { OpsLayout } from '../surfaces/ops/ops-layout.js';
import { OpsPlaceholder } from '../surfaces/ops/ops-placeholder.js';

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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <CustomerLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'trips',
        element: (
          <PlaceholderPage
            title="Your trips"
            note="Reservations and rentals appear here once booking is implemented."
          />
        ),
      },
      {
        path: 'account',
        element: (
          <PlaceholderPage
            title="Your account"
            note="Sign in, profile, drivers, and data requests are implemented in the identity stage."
          />
        ),
      },
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
      { index: true, element: <OpsDashboard /> },
      {
        path: 'sign-in',
        element: (
          <OpsPlaceholder
            title="Staff sign in"
            note="Credential + session handling is implemented in the identity stage (SCREEN-OPS-001)."
          />
        ),
      },
      {
        path: 'work',
        element: (
          <OpsPlaceholder
            title="Work queues"
            note="Operations queues (SCREEN-OPS-003) are built with the rental lifecycle stages."
          />
        ),
      },
      {
        path: 'fleet',
        element: (
          <OpsPlaceholder
            title="Fleet"
            note="Fleet inventory (SCREEN-OPS-013) lands in the fleet stage."
          />
        ),
      },
      {
        path: 'finance',
        element: (
          <OpsPlaceholder
            title="Finance"
            note="Payments & reconciliation (SCREEN-OPS-023/024) land in the reservation-operations stage."
          />
        ),
      },
      {
        path: 'config',
        element: (
          <OpsPlaceholder
            title="Configuration"
            note="Reference data (SCREEN-OPS-030/031) is implemented in the identity/config stage."
          />
        ),
      },
      {
        path: 'insights',
        element: (
          <OpsPlaceholder
            title="Insights"
            note="Reports (SCREEN-OPS-035) land in the administration stage."
          />
        ),
      },
    ],
  },
  { path: '*', element: <NotFound /> },
]);
