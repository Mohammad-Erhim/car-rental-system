/**
 * Runtime configuration for the browser API client. Each app calls `configureClient()` once at
 * startup — `apps/web` from `import.meta.env`, `apps/site` with static values — so the rest of
 * the package stays framework-agnostic (no `import.meta`, no `next/*`).
 */

export interface ClientConfig {
  /** Base path or origin for the versioned API, e.g. `/api/v1`. No trailing slash. */
  baseUrl: string;
  /** Prefix for generated correlation ids so logs show which surface a request came from. */
  correlationPrefix: string;
  /**
   * Which session this app owns: `staff` (ops dashboard) or `customer` (site). The API keeps a
   * separate refresh/CSRF cookie pair per audience — sent to it as `X-Auth-Audience` on `/auth/*`
   * — so the two apps, which share an origin, never overwrite or end each other's session.
   */
  audience: 'staff' | 'customer';
}

const config: ClientConfig = {
  baseUrl: '/api/v1',
  correlationPrefix: 'web',
  audience: 'customer',
};

export function configureClient(next: Partial<ClientConfig>): void {
  if (next.baseUrl !== undefined) config.baseUrl = next.baseUrl.replace(/\/$/, '');
  if (next.correlationPrefix !== undefined) config.correlationPrefix = next.correlationPrefix;
  if (next.audience !== undefined) config.audience = next.audience;
}

export function getClientConfig(): Readonly<ClientConfig> {
  return config;
}
