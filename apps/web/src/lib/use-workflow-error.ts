import { useI18n } from '@carrental/i18n/react';
import { useToast } from '@carrental/ui';

import { ApiError } from './api.js';

/**
 * Shared `onError` for config-editing mutations that would otherwise fail silently: the
 * config-version workflow (submit / approve / reject across branding, SEO, consent, templates,
 * pages, policies) plus translation catalogue edits and locale administration. Surfaces the exact
 * API rejection as a toast — e.g. "the author cannot approve their own draft", "this revision is
 * already published", or "the default locale cannot be deactivated".
 */
export function useWorkflowError() {
  const { t } = useI18n();
  const { toast } = useToast();
  return (e: unknown) =>
    toast({
      title:
        e instanceof ApiError
          ? e.problem.params?.reason === 'author_cannot_approve'
            ? t('ops.cfg.authorCannotApprove')
            : e.message
          : t('ops.cfg.actionFail'),
    });
}
