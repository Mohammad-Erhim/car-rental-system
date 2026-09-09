import { z } from 'zod';

import { zLocalized } from './pages';

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

/* ──────────────────────────────────────────────────────────────────────────
 * Ops-managed consent configuration (rides the generic `config_version`
 * workflow — kind `consent`, key `default`; no migration). `GET /meta/consent`
 * serves the published revision; the public banner + preference centre render
 * from it. Falls back to `DEFAULT_CONSENT_CONFIG` until a revision is published.
 * ────────────────────────────────────────────────────────────────────────── */

/** Bottom full-width bar, or a smaller bottom-corner card. */
export const CONSENT_LAYOUTS = ['bar', 'card'] as const;
export type ConsentLayout = (typeof CONSENT_LAYOUTS)[number];

export const zConsentCategoryConfig = z.object({
  id: z.enum(CONSENT_CATEGORIES),
  /** show this category in the preference centre (necessary is always shown) */
  shown: z.boolean().default(true),
  /** pre-ticked when the visitor opens preferences (necessary is always on) */
  defaultOn: z.boolean().default(false),
  name: zLocalized(60),
  description: zLocalized(400),
});
export type ConsentCategoryConfig = z.infer<typeof zConsentCategoryConfig>;

export const zConsentCookieRow = z.object({
  name: z.string().max(80),
  provider: z.string().max(80),
  category: z.enum(CONSENT_CATEGORIES),
  purpose: zLocalized(200),
  duration: z.string().max(60),
});
export type ConsentCookieRow = z.infer<typeof zConsentCookieRow>;

export const zConsentConfig = z.object({
  version: z.literal(1).default(1),
  /** master switch — off hides the banner entirely (no non-essential cookies either way) */
  enabled: z.boolean().default(true),
  /** bump to re-prompt every visitor whose stored choice predates it */
  policyVersion: z.number().int().positive().max(9999).default(CONSENT_POLICY_VERSION),
  layout: z
    .object({
      position: z.enum(CONSENT_LAYOUTS).default('bar'),
      showRejectAll: z.boolean().default(true),
    })
    .default({}),
  text: z.object({
    bannerTitle: zLocalized(120),
    bannerBody: zLocalized(600),
    prefsIntro: zLocalized(600),
  }),
  categories: z.array(zConsentCategoryConfig).min(1).max(4),
  /** optional cookie declaration shown on the Cookie Policy page */
  cookieTable: z.array(zConsentCookieRow).max(80).default([]),
});
export type ConsentConfig = z.infer<typeof zConsentConfig>;

export const zConsentConfigResponse = z.object({
  config: zConsentConfig,
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().nullable(),
});
export type ConsentConfigResponse = z.infer<typeof zConsentConfigResponse>;

const cat = (
  id: ConsentCategory,
  en: string,
  desc: string,
  fr: string,
  frDesc: string,
  ar: string,
  arDesc: string,
  extra: { shown?: boolean; defaultOn?: boolean } = {},
): ConsentCategoryConfig => ({
  id,
  shown: extra.shown ?? true,
  defaultOn: extra.defaultOn ?? false,
  name: { en, fr, ar },
  description: { en: desc, fr: frDesc, ar: arDesc },
});

export const DEFAULT_CONSENT_CONFIG: ConsentConfig = zConsentConfig.parse({
  version: 1,
  enabled: true,
  policyVersion: CONSENT_POLICY_VERSION,
  layout: { position: 'bar', showRejectAll: true },
  text: {
    bannerTitle: {
      en: 'Your cookie choices',
      fr: 'Vos choix de cookies',
      ar: 'اختياراتك لملفات تعريف الارتباط',
    },
    bannerBody: {
      en: 'We use necessary cookies to run the site. With your consent we also use functional, analytics and marketing cookies.',
      fr: 'Nous utilisons des cookies nécessaires pour faire fonctionner le site. Avec votre consentement, nous utilisons aussi des cookies fonctionnels, analytiques et marketing.',
      ar: 'نستخدم ملفات تعريف ارتباط ضرورية لتشغيل الموقع. وبموافقتك نستخدم أيضًا ملفات وظيفية وتحليلية وتسويقية.',
    },
    prefsIntro: {
      en: 'Choose which optional cookies to allow. You can change this any time from the footer.',
      fr: 'Choisissez les cookies optionnels à autoriser. Vous pouvez modifier ce choix à tout moment depuis le pied de page.',
      ar: 'اختر ملفات تعريف الارتباط الاختيارية التي تسمح بها. يمكنك تغيير ذلك في أي وقت من التذييل.',
    },
  },
  categories: [
    cat(
      'necessary',
      'Strictly necessary',
      'Required for sign-in, security and remembering this choice. These cannot be turned off.',
      'Strictement nécessaires',
      'Requis pour la connexion, la sécurité et la mémorisation de ce choix. Ils ne peuvent pas être désactivés.',
      'ضرورية للغاية',
      'مطلوبة لتسجيل الدخول والأمان وتذكّر هذا الاختيار. لا يمكن إيقافها.',
      { defaultOn: true },
    ),
    cat(
      'functional',
      'Functional',
      'Remembers preferences such as your language and recent searches.',
      'Fonctionnels',
      'Mémorise des préférences comme votre langue et vos recherches récentes.',
      'وظيفية',
      'تتذكّر تفضيلات مثل لغتك وعمليات البحث الأخيرة.',
    ),
    cat(
      'analytics',
      'Analytics',
      'Anonymous, aggregated usage data that helps us see what to improve.',
      'Analytiques',
      'Données d’usage anonymes et agrégées qui nous aident à voir quoi améliorer.',
      'تحليلية',
      'بيانات استخدام مجهولة ومجمّعة تساعدنا على معرفة ما ينبغي تحسينه.',
    ),
    cat(
      'marketing',
      'Marketing',
      'Used to measure campaigns and show offers that are more relevant to you.',
      'Marketing',
      'Servent à mesurer les campagnes et à afficher des offres plus pertinentes pour vous.',
      'تسويقية',
      'تُستخدم لقياس الحملات وعرض عروض أكثر صلة بك.',
    ),
  ],
  cookieTable: [
    {
      name: 'carrental_consent',
      provider: 'Car Rental',
      category: 'necessary',
      purpose: {
        en: 'Stores your cookie choice.',
        fr: 'Enregistre votre choix de cookies.',
        ar: 'يخزّن اختيارك لملفات تعريف الارتباط.',
      },
      duration: '12 months',
    },
    {
      name: 'carrental_cid',
      provider: 'Car Rental',
      category: 'necessary',
      purpose: {
        en: 'Random id that links your consent records.',
        fr: 'Identifiant aléatoire reliant vos enregistrements de consentement.',
        ar: 'معرّف عشوائي يربط سجلات موافقتك.',
      },
      duration: '12 months',
    },
    {
      name: 'carrental.session',
      provider: 'Car Rental',
      category: 'necessary',
      purpose: {
        en: 'Keeps you signed in.',
        fr: 'Vous garde connecté.',
        ar: 'يبقيك مسجّلاً للدخول.',
      },
      duration: 'Session',
    },
  ],
});

/* ── consent log (ops) ─────────────────────────────────────────────────── */

export const zConsentLogEntry = z.object({
  id: z.string(),
  at: z.string(),
  anonymousId: z.string().nullable(),
  action: z.enum(CONSENT_ACTIONS),
  choices: zConsentChoices,
  policyVersion: z.number().int(),
  staleVersion: z.boolean(),
  locale: z.string(),
  page: z.string().nullable(),
  ipPrefix: z.string().nullable(),
});
export type ConsentLogEntry = z.infer<typeof zConsentLogEntry>;

export const zConsentLogResponse = z.object({
  entries: z.array(zConsentLogEntry),
  total: z.number().int().nonnegative(),
  summary: z.object({
    total: z.number().int().nonnegative(),
    byAction: z.record(z.number().int().nonnegative()),
    /** opt-in rate per optional category, 0–100, over the queried window */
    optInPct: z.object({
      functional: z.number(),
      analytics: z.number(),
      marketing: z.number(),
    }),
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
});
export type ConsentLogResponse = z.infer<typeof zConsentLogResponse>;
