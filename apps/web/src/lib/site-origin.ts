/**
 * Where the public site lives, for the live preview and the "View public site" link.
 *
 * Behind the single-origin setup (the site proxies `/ops` to this app) the site is simply this
 * origin. When the dashboard is opened straight on its own dev port (3100) that would show the
 * dashboard itself, so the site's dev port (3000) is used instead. `VITE_SITE_URL` overrides both.
 */
const DEV_DASHBOARD_PORT = '3100';
const DEV_SITE_PORT = '3000';

export function resolveSiteOrigin(
  configured: string | undefined,
  loc: Pick<Location, 'origin' | 'port' | 'protocol' | 'hostname'>,
): string {
  if (configured) return configured.replace(/\/$/, '');
  if (loc.port === DEV_DASHBOARD_PORT) return `${loc.protocol}//${loc.hostname}:${DEV_SITE_PORT}`;
  return loc.origin;
}

export const SITE_ORIGIN = resolveSiteOrigin(
  import.meta.env.VITE_SITE_URL as string | undefined,
  window.location,
);
