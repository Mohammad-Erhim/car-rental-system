import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import './index.css';
import { AppProviders } from './app/providers.js';
import { router } from './app/router.js';
import { RootErrorBoundary } from './components/error-boundary.js';

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
