// MUST match the `mobile.onboarding.*` entries in
// apps/api/src/database/seed/mobile-i18n.ts — duplicated rather than imported since an app may
// not import another app (same constraint apps/mobile/src/lib/api/cookies.ts's CSRF_COOKIE name
// documents). The `mobile` namespace itself has no static bundle in `@carrental/i18n` by design
// (site/web would ship it for nothing) — but onboarding is the one screen guaranteed to render on
// a completely cold start with no cache and no prior session, so without *some* local fallback it
// briefly renders the raw humanised key ("Title", "Body") instead of real copy on a slow network.
export const ONBOARDING_FALLBACK: Record<string, Record<string, string>> = {
  en: {
    'mobile.onboarding.skip': 'Skip',
    'mobile.onboarding.next': 'Next',
    'mobile.onboarding.getStarted': 'Get started',
    'mobile.onboarding.slide1.title': 'Rent a car that fits the trip',
    'mobile.onboarding.slide1.body':
      'Transparent pricing, easy changes, and pickup where you need it.',
    'mobile.onboarding.slide2.title': 'Book in two minutes',
    'mobile.onboarding.slide2.body':
      'Pick a location, choose a class, confirm. Your reference is instant.',
    'mobile.onboarding.slide3.title': 'Everything in one app',
    'mobile.onboarding.slide3.body':
      'Manage trips, saved drivers, receipts and support without digging through email.',
  },
  fr: {
    'mobile.onboarding.skip': 'Passer',
    'mobile.onboarding.next': 'Suivant',
    'mobile.onboarding.getStarted': 'Commencer',
    'mobile.onboarding.slide1.title': 'Une voiture adaptée à votre trajet',
    'mobile.onboarding.slide1.body':
      'Tarifs transparents, modifications faciles, prise en charge où vous en avez besoin.',
    'mobile.onboarding.slide2.title': 'Réservez en deux minutes',
    'mobile.onboarding.slide2.body':
      'Choisissez un lieu, une catégorie, confirmez. Votre référence est immédiate.',
    'mobile.onboarding.slide3.title': 'Tout dans une seule application',
    'mobile.onboarding.slide3.body':
      'Gérez vos trajets, conducteurs enregistrés, reçus et assistance en un seul endroit.',
  },
  ar: {
    'mobile.onboarding.skip': 'تخطي',
    'mobile.onboarding.next': 'التالي',
    'mobile.onboarding.getStarted': 'ابدأ الآن',
    'mobile.onboarding.slide1.title': 'استأجر سيارة تناسب رحلتك',
    'mobile.onboarding.slide1.body': 'أسعار واضحة، تعديلات سهلة، واستلام أينما احتجت.',
    'mobile.onboarding.slide2.title': 'احجز خلال دقيقتين',
    'mobile.onboarding.slide2.body': 'اختر موقعًا وفئة ثم أكّد. رقم حجزك يظهر فورًا.',
    'mobile.onboarding.slide3.title': 'كل شيء في تطبيق واحد',
    'mobile.onboarding.slide3.body':
      'إدارة رحلاتك وسائقيك المحفوظين والإيصالات والدعم من مكان واحد.',
  },
};
