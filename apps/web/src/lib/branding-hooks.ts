import type { BrandAssetPurpose, BrandAssetUploadResponse } from '@carrental/contracts';
import type { BrandConfig } from '@carrental/theme';
import { useMutation } from '@tanstack/react-query';

import { apiFetch } from './api.js';
import { createConfigWorkflowHooks } from './config-workflow-hooks.js';

/** STAGE-009 (DEC-025) — the `branding` config-version rides the generic config workflow. */
export const BRANDING_KIND = 'branding';
export const BRANDING_KEY = 'default';

const hooks = createConfigWorkflowHooks<BrandConfig, { examples: string[]; aaClean?: boolean }>(
  BRANDING_KIND,
  BRANDING_KEY,
);

/** Public — the currently published brand config (or the built-in default). */
export const usePublishedBranding = hooks.usePublished;
export const useBrandingVersions = hooks.useVersions;
export const useDraftBranding = hooks.useDraft;
export const useBrandingPreview = hooks.usePreview;
export const useBrandingTransition = hooks.useTransition;

/** STAGE-009 — upload a brand image; returns an `obj:` ref to store in `assets.<purpose>`. */
export function useUploadBrandAsset() {
  return useMutation({
    mutationFn: async (input: { purpose: BrandAssetPurpose; file: File }) => {
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
