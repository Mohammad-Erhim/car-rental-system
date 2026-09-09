import { z } from 'zod';

/**
 * Cookie / privacy consent (public site, GDPR + ePrivacy). The visitor's choice lives in a
 * first-party cookie; every choice is also POSTed to `/api/v1/consent` and written to the
 * append-only audit trail so the operator can demonstrate consent (GDPR Art. 7(1)).
 *
 * Bump `CONSENT_POLICY_VERSION` whenever the cookie/privacy policy or the category set changes
 * — the banner re-prompts every visitor whose stored choice predates the new version.
 */
export const CONSENT_POLICY_VERSION = 1;

/** Category order is also the display order in the preference centre. */
export const CONSENT_CATEGORIES = ['necessary', 'functional', 'analytics', 'marketing'] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

/** `necessary` is always on (strictly-necessary cookies need no consent); the rest are opt-in. */
export const zConsentChoices = z.object({
  necessary: z.literal(true),
  functional: z.boolean(),
  analytics: z.boolean(),
  marketing: z.boolean(),
});
export type ConsentChoices = z.infer<typeof zConsentChoices>;

export const CONSENT_ACTIONS = [
  'accept_all',
  'reject_all',
  'save_preferences',
  'withdraw',
] as const;
export type ConsentAction = (typeof CONSENT_ACTIONS)[number];

export const zConsentSubmitRequest = z.object({
  /** Opaque client-generated id (a cookie) — correlates a visitor's consent events, no PII. */
  anonymousId: z.string().uuid(),
  action: z.enum(CONSENT_ACTIONS),
  choices: zConsentChoices,
  policyVersion: z.number().int().positive().max(9999),
  locale: z.string().max(12),
  /** Where the choice was made, for the audit note. */
  page: z.string().max(300).optional(),
});
export type ConsentSubmitRequest = z.infer<typeof zConsentSubmitRequest>;

export const zConsentSubmitResponse = z.object({
  recorded: z.boolean(),
  policyVersion: z.number().int().positive(),
});
export type ConsentSubmitResponse = z.infer<typeof zConsentSubmitResponse>;

/** Default cookie value for a visitor who has not chosen yet — only necessary is on. */
export const DEFAULT_CONSENT_CHOICES: ConsentChoices = {
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false,
};

export const ALL_CONSENT_CHOICES: ConsentChoices = {
  necessary: true,
  functional: true,
  analytics: true,
  marketing: true,
};
