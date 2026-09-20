/**
 * Every dashboard route in one place. Paths are router-relative (the app is mounted at `/ops`).
 * Feature code links through these, so a route is renamed here and nowhere else; `LEGACY_REDIRECTS`
 * keeps the old addresses (bookmarks, emails, the audit trail) working.
 */
const enc = encodeURIComponent;

export const paths = {
  dashboard: '/',
  tasks: '/tasks',
  request: (id: string) => `/tasks/${enc(id)}`,
  search: '/search',

  // operations
  reservations: '/reservations',
  reservation: (reference: string) => `/reservations/${enc(reference)}`,
  rentals: '/rentals',
  rental: (reference: string) => `/rentals/${enc(reference)}`,
  fleet: '/fleet',
  customers: '/customers',
  customer: (id: string) => `/customers/${enc(id)}`,

  // money
  finance: '/finance',
  reports: '/reports',

  // catalogue & pricing
  categories: '/catalogue/categories',
  categoryFeatures: '/catalogue/categories/features',
  ratePlans: '/catalogue/rate-plans',
  products: '/catalogue/products',
  locations: '/catalogue/locations',
  location: (code: string) => `/catalogue/locations/${enc(code)}`,

  // website
  pages: '/website/pages',
  branding: '/website/branding',
  seo: '/website/seo',
  consent: '/website/consent',
  media: '/website/media',
  languages: '/website/languages',
  translations: '/website/translations',
  translationEditor: (namespace: string, locale: string) =>
    `/website/translations/${enc(namespace)}/${enc(locale)}`,
  templates: '/website/templates',
  template: (key: string, channel: string) => `/website/templates/${enc(key)}/${enc(channel)}`,

  // settings
  organization: '/settings/organization',
  policies: '/settings/policies',
  referenceData: '/settings/reference-data',
  integrations: '/settings/integrations',
  payments: '/settings/integrations/payments',
  email: '/settings/integrations/email',

  // administration
  staff: '/admin/staff',
  access: '/admin/access',
  workflows: '/admin/workflows',
  workflow: (id: string) => `/admin/workflows/${enc(id)}`,
  audit: '/admin/audit',
  consentLog: '/admin/consent-log',
  dataQuality: '/admin/data-quality',
} as const;

/**
 * Old address → new address. `:param` segments are carried over, and the query string and hash are
 * kept. Order matters only for readability; matching is by exact pattern.
 */
export const LEGACY_REDIRECTS: Array<[from: string, to: string]> = [
  ['/work', '/reservations'],
  ['/work/:reference', '/reservations/:reference'],
  ['/config', '/settings/policies'],
  ['/config/reference-data', '/settings/reference-data'],
  ['/config/rate-plans', '/catalogue/rate-plans'],
  ['/config/locations', '/catalogue/locations'],
  ['/config/locations/:code', '/catalogue/locations/:code'],
  ['/config/organization', '/settings/organization'],
  ['/config/languages', '/website/languages'],
  ['/config/translations', '/website/translations'],
  ['/config/translations/:namespace/:locale', '/website/translations/:namespace/:locale'],
  ['/config/templates', '/website/templates'],
  ['/config/templates/:key/:channel', '/website/templates/:key/:channel'],
  ['/config/pages', '/website/pages'],
  ['/config/branding', '/website/branding'],
  ['/config/seo', '/website/seo'],
  ['/config/consent', '/website/consent'],
  ['/config/payments', '/settings/integrations/payments'],
  ['/config/email', '/settings/integrations/email'],
  ['/catalogue/media', '/website/media'],
  ['/insights', '/reports'],
  ['/audit', '/admin/audit'],
  ['/consent-log', '/admin/consent-log'],
  ['/data-quality', '/admin/data-quality'],
];

/** Fill a `/x/:a/:b` pattern from route params (already decoded by the router; re-encoded here). */
export function fillPattern(pattern: string, params: Record<string, string | undefined>): string {
  return pattern.replace(/:(\w+)/g, (_m, name: string) => enc(params[name] ?? ''));
}

/**
 * The pages whose content the top-bar location filter narrows (every one reads it through
 * `useLocationScope()`). Everywhere else the filter is shown as "organisation-wide" and inactive:
 * finance, catalogue, staff, settings and the audit log are not organised by branch. Router-
 * relative pathnames, exact match.
 */
const LOCATION_SCOPED = new Set<string>([
  paths.dashboard,
  paths.search,
  paths.reservations,
  paths.rentals,
  paths.fleet,
  paths.reports,
  paths.ratePlans,
]);

export function isLocationScopedPath(pathname: string): boolean {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return LOCATION_SCOPED.has(clean);
}

/**
 * Areas that cover the whole organisation (settings, website, finance, audit, catalogue setup). The
 * API refuses them to an account limited to specific locations, so the console hides them from that
 * account's navigation and answers a direct visit with an explanation instead of a wall of errors.
 * Mirrors the `@OrgWide()` endpoints on the API. Prefix match on router-relative paths.
 */
const ORG_WIDE_PREFIXES: readonly string[] = [
  paths.finance,
  paths.categories, // also covers /catalogue/categories/features
  '/website/pages',
  paths.branding,
  paths.seo,
  paths.consent,
  paths.languages,
  paths.translations,
  paths.templates,
  '/settings',
  '/admin/audit',
  paths.access,
  paths.workflows,
  paths.consentLog,
  paths.dataQuality,
];

export function isOrgWidePath(pathname: string): boolean {
  return ORG_WIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
