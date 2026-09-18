import { seoConfigSchema, type SeoConfig } from '@carrental/contracts';

/** The form keeps every field as text; an empty optional field becomes `null` on save. */
export interface SeoValues {
  siteName: string;
  titleTemplate: string;
  defaultTitle: string;
  defaultDescription: string;
  canonicalBaseUrl: string;
  ogImageUrl: string;
  twitterHandle: string;
  organizationLogoUrl: string;
  indexable: boolean;
  googleSiteVerification: string;
  bingSiteVerification: string;
  note: string;
}

export const seoValues = (c: SeoConfig): SeoValues => ({
  siteName: c.siteName,
  titleTemplate: c.titleTemplate,
  defaultTitle: c.defaultTitle,
  defaultDescription: c.defaultDescription,
  canonicalBaseUrl: c.canonicalBaseUrl,
  ogImageUrl: c.ogImageUrl ?? '',
  twitterHandle: c.twitterHandle ?? '',
  organizationLogoUrl: c.organizationLogoUrl ?? '',
  indexable: c.indexable,
  googleSiteVerification: c.googleSiteVerification ?? '',
  bingSiteVerification: c.bingSiteVerification ?? '',
  note: '',
});

const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

/** Build the API payload from the form and validate it with the same schema the API uses. */
export function toSeoConfig(v: SeoValues) {
  return seoConfigSchema.safeParse({
    siteName: v.siteName,
    titleTemplate: v.titleTemplate,
    defaultTitle: v.defaultTitle,
    defaultDescription: v.defaultDescription,
    canonicalBaseUrl: v.canonicalBaseUrl,
    ogImageUrl: orNull(v.ogImageUrl),
    twitterHandle: orNull(v.twitterHandle),
    organizationLogoUrl: orNull(v.organizationLogoUrl),
    indexable: v.indexable,
    googleSiteVerification: orNull(v.googleSiteVerification),
    bingSiteVerification: orNull(v.bingSiteVerification),
  });
}

/** The title a search result would show for the home page. */
export const resultTitle = (c: Pick<SeoConfig, 'titleTemplate' | 'defaultTitle'>) =>
  c.titleTemplate.includes('%s') ? c.titleTemplate.replace('%s', c.defaultTitle) : c.defaultTitle;

/** Field-level messages from a failed parse, keyed by the field name. */
export function fieldIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const key = String(i.path[0] ?? '');
    if (key && !out[key]) out[key] = i.message;
  }
  return out;
}
