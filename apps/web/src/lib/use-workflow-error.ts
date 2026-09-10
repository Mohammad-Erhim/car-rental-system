import { useI18n } from '@carrental/i18n/react';
import { useToast } from '@carrental/ui';

import { ApiError } from './api.js';

/**
 * Shared `onError` for the config-version workflow mutations (submit / approve / reject across
 * branding, SEO, consent, templates, pages, policies). Surfaces the exact API rejection as a
 * toast instead of the action failing silently — e.g. "the author cannot approve their own draft"
 * or "this revision is already published".
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
