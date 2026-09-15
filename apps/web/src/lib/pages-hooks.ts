import type { BrandAssetUploadResponse, PagesConfig } from '@carrental/contracts';
import { useMutation } from '@tanstack/react-query';

import { apiFetch } from './api.js';
import { createConfigWorkflowHooks } from './config-workflow-hooks.js';

/** The `pages` config-version rides the generic draft → submit → approve workflow. */
export const PAGES_KIND = 'pages';
export const PAGES_KEY = 'default';

const hooks = createConfigWorkflowHooks<PagesConfig>(PAGES_KIND, PAGES_KEY);

/** Public — the currently published page config (or the built-in default). */
export const usePublishedPages = hooks.usePublished;
export const usePagesVersions = hooks.useVersions;
export const useDraftPages = hooks.useDraft;
export const usePagesPreview = hooks.usePreview;
export const usePagesTransition = hooks.useTransition;

/** Upload a page image (hero background / content image); returns an `obj:` ref + a signed URL. */
export function useUploadPageAsset() {
  return useMutation({
    mutationFn: async (input: { purpose: 'heroImage' | 'pageImage'; file: File }) => {
      const dataBase64 = await fileToBase64(input.file);
      return apiFetch<BrandAssetUploadResponse>('/config/branding/assets', {
        method: 'POST',
        body: { purpose: input.purpose, mediaType: input.file.type, dataBase64 },
      });
    },
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(file);
  });
}
