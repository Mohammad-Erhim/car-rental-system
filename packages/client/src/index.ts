/**
 * `@carrental/client` — the framework-agnostic browser runtime shared by `apps/web` and
 * `apps/site`. No React, no Next, no bundler globals here; the `./react` entry point holds the
 * hooks. Call `configureClient()` once at app startup.
 */
export { configureClient, getClientConfig, type ClientConfig } from './config';
export { ApiError } from './api-error';
export { apiFetch, type RequestOptions } from './api-fetch';
export {
  setAccessToken,
  getAccessToken,
  registerRefreshHandler,
  getRefreshHandler,
  registerStepUpHandler,
} from './token-store';
export { createQueryClient, type QueryClientOptions } from './query-client';
export { stashReturnTo, takeReturnTo, peekReturnTo } from './return-to';
export { submitWithBankChallenge, BankChallengeFailedError } from './bank-challenge';
