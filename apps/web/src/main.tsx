import { configureClient } from '@carrental/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import './index.css';
import { AppProviders } from './app/providers.js';
import { router } from './app/router.js';
import { RootErrorBoundary } from './components/error-boundary.js';

// The ops dashboard is served under /ops and proxied same-origin to the API (DEC-021).
configureClient({
  baseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1',
  correlationPrefix: 'web',
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <RootErrorBoundary>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </RootErrorBoundary>
  </StrictMode>,
);
