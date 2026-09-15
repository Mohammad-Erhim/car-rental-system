import type { SeoConfig } from '@carrental/contracts';

import { createConfigWorkflowHooks } from './config-workflow-hooks.js';

/** SRS-ADM-006 — the `seo` config-version rides the generic draft → submit → approve workflow. */
export const SEO_KIND = 'seo';
export const SEO_KEY = 'default';

const hooks = createConfigWorkflowHooks<SeoConfig>(SEO_KIND, SEO_KEY);

/** Public — the currently published SEO config (or the built-in default). */
export const usePublishedSeo = hooks.usePublished;
export const useSeoVersions = hooks.useVersions;
export const useDraftSeo = hooks.useDraft;
export const useSeoPreview = hooks.usePreview;
export const useSeoTransition = hooks.useTransition;
