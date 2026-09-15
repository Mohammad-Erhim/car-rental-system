// `createQueryClient` and `ApiError` are the two exports of `@carrental/client`'s root entry
// point with zero DOM dependency — safe to reuse verbatim in React Native (CLAUDE.md: never
// solve the same problem twice). Re-exported from here so every mobile import of "the API
// client layer" goes through `src/lib/api`, not a mix of `@carrental/client` and local modules.
export { createQueryClient, ApiError, type QueryClientOptions } from '@carrental/client';
