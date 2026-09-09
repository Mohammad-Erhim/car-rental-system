/**
 * Ops dashboard API surface. The transport (apiFetch, ApiError, token store, silent refresh,
 * step-up retry) lives in `@carrental/client` and is shared with `apps/site` — this file only
 * re-exports it for existing local imports and adds the dashboard-specific `metaApi` namespace.
 * New code should import the transport from `@carrental/client` directly.
 */
import { apiFetch } from '@carrental/client';
import type { BuildInfo, HealthSummary, LocalesResponse } from '@carrental/contracts';

export {
  apiFetch,
  ApiError,
  setAccessToken,
  getAccessToken,
  registerRefreshHandler,
  registerStepUpHandler,
  type RequestOptions,
} from '@carrental/client';

export const metaApi = {
  locales: (signal?: AbortSignal) =>
    apiFetch<LocalesResponse>('/meta/locales', { signal, anonymous: true }),
  build: (signal?: AbortSignal) => apiFetch<BuildInfo>('/meta/build', { signal, anonymous: true }),
  healthSummary: (signal?: AbortSignal) =>
    apiFetch<HealthSummary>('/meta/health-summary', { signal, anonymous: true }),
};
