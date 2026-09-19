import { useI18n } from '@carrental/i18n/react';
import { toast } from 'sonner';

import { ApiError } from './api.js';

/**
 * Shared `onError` for config-editing mutations that would otherwise fail silently: the
 * config-version workflow (submit / approve / reject across branding, SEO, consent, templates,
 * pages, policies) plus translation catalogue edits and locale administration. Surfaces the exact
 * API rejection as a toast — e.g. "this revision is already published", or "the default locale
 * cannot be deactivated".
 */
export function useWorkflowError() {
  const { t } = useI18n();
  return (e: unknown) => toast.error(e instanceof ApiError ? e.message : t('ops.cfg.actionFail'));
}
