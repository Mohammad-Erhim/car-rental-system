import type { ResourceBundle } from '@carrental/i18n';

/**
 * Seed source for the `mobile` translation namespace — native-only concepts (RTL relaunch, push
 * priming, biometric unlock, onboarding, camera capture, app-store rating) that have no
 * `apps/site` equivalent, so they don't belong in `@carrental/i18n`'s shared bundle (that package
 * is imported by every frontend, and site/web would ship these strings for nothing).
 *
 * Unlike `common` (which is seeded *from* `@carrental/i18n`'s bundled JSON — see `seedSystem`),
 * this namespace has no static bundle anywhere: this file is the only source of truth, and
 * `apps/mobile` fetches it at runtime via `GET /meta/translations?namespace=mobile&locale=<x>`
 * (`TranslationService.publishedBundle`, namespace-agnostic by design). Edit values here and
 * re-run the system seed to publish a change with no app release required.
 */
export const MOBILE_TRANSLATIONS: ResourceBundle = {
  en: {
    'mobile.tabs.home': 'Home',
    'mobile.restartForLanguage': 'Restart the app to finish switching this language.',
    'mobile.later': 'Later',
    'mobile.restartNow': 'Restart now',
    'mobile.restartFailedManual': "Couldn't restart automatically — please close and reopen the app to finish switching the language.",
    'mobile.gotIt': 'Got it',

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

    'mobile.push.title': 'Stay on top of your trip',
    'mobile.push.body':
      'Get a notification when your booking is confirmed, your car is ready, or plans change.',
    'mobile.push.allow': 'Enable notifications',
    'mobile.push.notNow': 'Not now',
    'mobile.push.deniedHint': 'You can turn these on any time from your phone Settings.',

    'mobile.biometric.enableTitle': 'Unlock faster next time',
    'mobile.biometric.enableBody': 'Use {method} instead of your password to sign back in.',
    'mobile.biometric.enable': 'Turn on {method}',
    'mobile.biometric.skip': 'Not now',
    'mobile.biometric.unlockPrompt': 'Unlock to continue',
    'mobile.biometric.faceId': 'Face ID',
    'mobile.biometric.faceUnlock': 'face unlock',
    'mobile.biometric.touchId': 'Touch ID',
    'mobile.biometric.fingerprint': 'fingerprint unlock',

    'mobile.camera.licenceTitle': 'Photograph your licence',
    'mobile.camera.retake': 'Retake',
    'mobile.camera.usePhoto': 'Use photo',
    'mobile.camera.pickFromLibrary': 'Choose from library',
    'mobile.camera.takePhoto': 'Take a photo',
    'mobile.camera.permissionTitle': 'Camera access needed',
    'mobile.camera.permissionBody': 'Allow camera access to photograph your driving licence.',

    'mobile.location.title': 'Find nearby pickup points',
    'mobile.location.body': 'Allow location access to sort pickup locations by distance.',
    'mobile.location.allow': 'Allow location access',
    'mobile.location.skip': 'Choose manually',
    'mobile.location.distanceAway': '{distance} away',

    'mobile.rate.title': 'Enjoying Car Rental?',
    'mobile.rate.body': 'A quick rating helps other travellers find us.',
    'mobile.rate.rate': 'Rate the app',
    'mobile.rate.later': 'Maybe later',
    'mobile.rate.never': "Don't ask again",

    'mobile.update.available': 'A new version is ready',
    'mobile.update.body': 'Restart to get the latest fixes and features.',
    'mobile.update.restart': 'Restart',

    'mobile.settings.title': 'Settings',
    'mobile.settings.appearance': 'Appearance',
    'mobile.settings.language': 'Language',
    'mobile.settings.notifications': 'Notifications',
    'mobile.settings.security': 'Security',
    'mobile.settings.about': 'About',
    'mobile.settings.version': 'Version {version}',
    'mobile.settings.signOutEverywhere': 'Sign out of all devices',
    'mobile.settings.deleteAccount': 'Close account',

    'mobile.home.greeting': 'Where to next, {name}?',
    'mobile.home.greetingAnon': 'Where to next?',
    'mobile.home.recentSearch': 'Recent search',
    'mobile.home.quickPickup': 'Pickup',
    'mobile.home.quickReturn': 'Return',
    'mobile.home.editSearch': 'Edit search',
    'mobile.home.viewAllLocations': 'All locations',

    'mobile.search.filters': 'Filters',
    'mobile.search.sortBy': 'Sort',
    'mobile.search.sort.priceAsc': 'Price: low to high',
    'mobile.search.sort.priceDesc': 'Price: high to low',
    'mobile.search.sort.recommended': 'Recommended',
    'mobile.search.applyFilters': 'Show results',
    'mobile.search.resetFilters': 'Reset',
    'mobile.search.transmission': 'Transmission',
    'mobile.search.seats': 'Minimum seats',
    'mobile.search.editDates': 'Edit dates',

    'mobile.picker.pickupLocation': 'Pickup location',
    'mobile.picker.returnLocation': 'Return location',
    'mobile.picker.pickupDate': 'Pickup date',
    'mobile.picker.pickupTime': 'Pickup time',
    'mobile.picker.returnDate': 'Return date',
    'mobile.picker.returnTime': 'Return time',
    'mobile.picker.done': 'Done',
    'mobile.picker.sameLocation': 'Return to the same location',
    'mobile.picker.differentLocation': 'Return to a different location',

    'mobile.trips.upcoming': 'Upcoming',
    'mobile.trips.active': 'Active',
    'mobile.trips.past': 'Past',
    'mobile.trips.pullToRefresh': 'Pull to refresh',
    'mobile.trips.shareReference': 'Share booking reference',

    'mobile.checkout.scanCard': 'Scan card',
    'mobile.checkout.savedCards': 'Saved cards',
    'mobile.checkout.newCard': 'New card',
    'mobile.checkout.applePay': 'Pay with Apple Pay',
    'mobile.checkout.googlePay': 'Pay with Google Pay',

    'mobile.deepLink.invalidTitle': "That link didn't work",
    'mobile.deepLink.invalidBody': 'The page you were sent to could not be found.',

    'mobile.offline.cannotBook': "You're offline — booking needs a connection.",
    'mobile.nav.viewOn': 'Open in Maps',
    'mobile.imagePicker.permissionTitle': 'Photo access needed',
    'mobile.imagePicker.permissionBody': 'Allow photo library access to attach an image.',
  },
  fr: {
    'mobile.tabs.home': 'Accueil',
    'mobile.restartForLanguage': "Redémarrez l'application pour terminer le changement de langue.",
    'mobile.later': 'Plus tard',
    'mobile.restartNow': 'Redémarrer maintenant',
    'mobile.restartFailedManual':
      "Le redémarrage automatique a échoué — fermez et rouvrez l'application pour terminer le changement de langue.",
    'mobile.gotIt': 'Compris',

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

    'mobile.push.title': 'Restez informé de votre trajet',
    'mobile.push.body':
      'Recevez une notification dès que votre réservation est confirmée, votre voiture prête, ou en cas de changement.',
    'mobile.push.allow': 'Activer les notifications',
    'mobile.push.notNow': 'Pas maintenant',
    'mobile.push.deniedHint':
      'Vous pouvez les activer à tout moment dans les réglages de votre téléphone.',

    'mobile.biometric.enableTitle': 'Déverrouillez plus vite la prochaine fois',
    'mobile.biometric.enableBody':
      'Utilisez {method} au lieu de votre mot de passe pour vous reconnecter.',
    'mobile.biometric.enable': 'Activer {method}',
    'mobile.biometric.skip': 'Pas maintenant',
    'mobile.biometric.unlockPrompt': 'Déverrouillez pour continuer',
    'mobile.biometric.faceId': 'Face ID',
    'mobile.biometric.faceUnlock': 'la reconnaissance faciale',
    'mobile.biometric.touchId': 'Touch ID',
    'mobile.biometric.fingerprint': 'le déverrouillage par empreinte',

    'mobile.camera.licenceTitle': 'Photographiez votre permis',
    'mobile.camera.retake': 'Reprendre',
    'mobile.camera.usePhoto': 'Utiliser la photo',
    'mobile.camera.pickFromLibrary': 'Choisir dans la bibliothèque',
    'mobile.camera.takePhoto': 'Prendre une photo',
    'mobile.camera.permissionTitle': "Accès à l'appareil photo requis",
    'mobile.camera.permissionBody':
      "Autorisez l'appareil photo pour photographier votre permis de conduire.",

    'mobile.location.title': 'Trouvez les points de prise en charge proches',
    'mobile.location.body':
      'Autorisez la localisation pour trier les lieux de prise en charge par distance.',
    'mobile.location.allow': 'Autoriser la localisation',
    'mobile.location.skip': 'Choisir manuellement',
    'mobile.location.distanceAway': 'à {distance}',

    'mobile.rate.title': 'Vous appréciez Car Rental ?',
    'mobile.rate.body': "Une note rapide aide d'autres voyageurs à nous trouver.",
    'mobile.rate.rate': "Noter l'application",
    'mobile.rate.later': 'Plus tard',
    'mobile.rate.never': 'Ne plus demander',

    'mobile.update.available': 'Une nouvelle version est prête',
    'mobile.update.body': 'Redémarrez pour profiter des derniers correctifs et fonctionnalités.',
    'mobile.update.restart': 'Redémarrer',

    'mobile.settings.title': 'Réglages',
    'mobile.settings.appearance': 'Apparence',
    'mobile.settings.language': 'Langue',
    'mobile.settings.notifications': 'Notifications',
    'mobile.settings.security': 'Sécurité',
    'mobile.settings.about': 'À propos',
    'mobile.settings.version': 'Version {version}',
    'mobile.settings.signOutEverywhere': 'Se déconnecter de tous les appareils',
    'mobile.settings.deleteAccount': 'Fermer le compte',

    'mobile.home.greeting': 'Où allez-vous, {name} ?',
    'mobile.home.greetingAnon': 'Où allez-vous ?',
    'mobile.home.recentSearch': 'Recherche récente',
    'mobile.home.quickPickup': 'Prise en charge',
    'mobile.home.quickReturn': 'Retour',
    'mobile.home.editSearch': 'Modifier la recherche',
    'mobile.home.viewAllLocations': 'Tous les lieux',

    'mobile.search.filters': 'Filtres',
    'mobile.search.sortBy': 'Trier',
    'mobile.search.sort.priceAsc': 'Prix croissant',
    'mobile.search.sort.priceDesc': 'Prix décroissant',
    'mobile.search.sort.recommended': 'Recommandé',
    'mobile.search.applyFilters': 'Afficher les résultats',
    'mobile.search.resetFilters': 'Réinitialiser',
    'mobile.search.transmission': 'Transmission',
    'mobile.search.seats': 'Places minimum',
    'mobile.search.editDates': 'Modifier les dates',

    'mobile.picker.pickupLocation': 'Lieu de prise en charge',
    'mobile.picker.returnLocation': 'Lieu de retour',
    'mobile.picker.pickupDate': 'Date de prise en charge',
    'mobile.picker.pickupTime': 'Heure de prise en charge',
    'mobile.picker.returnDate': 'Date de retour',
    'mobile.picker.returnTime': 'Heure de retour',
    'mobile.picker.done': 'Terminé',
    'mobile.picker.sameLocation': 'Retour au même endroit',
    'mobile.picker.differentLocation': 'Retour à un endroit différent',

    'mobile.trips.upcoming': 'À venir',
    'mobile.trips.active': 'En cours',
    'mobile.trips.past': 'Passés',
    'mobile.trips.pullToRefresh': 'Tirer pour actualiser',
    'mobile.trips.shareReference': 'Partager la référence',

    'mobile.checkout.scanCard': 'Scanner la carte',
    'mobile.checkout.savedCards': 'Cartes enregistrées',
    'mobile.checkout.newCard': 'Nouvelle carte',
    'mobile.checkout.applePay': 'Payer avec Apple Pay',
    'mobile.checkout.googlePay': 'Payer avec Google Pay',

    'mobile.deepLink.invalidTitle': "Ce lien n'a pas fonctionné",
    'mobile.deepLink.invalidBody': 'La page demandée est introuvable.',

    'mobile.offline.cannotBook': 'Vous êtes hors ligne — la réservation nécessite une connexion.',
    'mobile.nav.viewOn': 'Ouvrir dans Plans',
    'mobile.imagePicker.permissionTitle': 'Accès aux photos requis',
    'mobile.imagePicker.permissionBody': "Autorisez l'accès à la photothèque pour joindre une image.",
  },
  ar: {
    'mobile.tabs.home': 'الرئيسية',
    'mobile.restartForLanguage': 'أعد تشغيل التطبيق لإتمام تغيير اللغة.',
    'mobile.later': 'لاحقًا',
    'mobile.restartNow': 'إعادة التشغيل الآن',
    'mobile.restartFailedManual': 'تعذّر إعادة التشغيل تلقائيًا — أغلق التطبيق وأعد فتحه لإتمام تغيير اللغة.',
    'mobile.gotIt': 'حسنًا',

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

    'mobile.push.title': 'تابع رحلتك أولًا بأول',
    'mobile.push.body': 'ستصلك إشعارات عند تأكيد الحجز أو جاهزية السيارة أو أي تغيير.',
    'mobile.push.allow': 'تفعيل الإشعارات',
    'mobile.push.notNow': 'ليس الآن',
    'mobile.push.deniedHint': 'يمكنك تفعيلها لاحقًا من إعدادات هاتفك.',

    'mobile.biometric.enableTitle': 'فتح أسرع في المرة القادمة',
    'mobile.biometric.enableBody': 'استخدم {method} بدلاً من كلمة المرور لتسجيل الدخول.',
    'mobile.biometric.enable': 'تفعيل {method}',
    'mobile.biometric.skip': 'ليس الآن',
    'mobile.biometric.unlockPrompt': 'افتح القفل للمتابعة',
    'mobile.biometric.faceId': 'Face ID',
    'mobile.biometric.faceUnlock': 'فتح القفل بالوجه',
    'mobile.biometric.touchId': 'Touch ID',
    'mobile.biometric.fingerprint': 'بصمة الإصبع',

    'mobile.camera.licenceTitle': 'صوّر رخصة القيادة',
    'mobile.camera.retake': 'إعادة التصوير',
    'mobile.camera.usePhoto': 'استخدام الصورة',
    'mobile.camera.pickFromLibrary': 'اختيار من المعرض',
    'mobile.camera.takePhoto': 'التقاط صورة',
    'mobile.camera.permissionTitle': 'الوصول إلى الكاميرا مطلوب',
    'mobile.camera.permissionBody': 'اسمح بالوصول إلى الكاميرا لتصوير رخصة القيادة.',

    'mobile.location.title': 'ابحث عن أقرب نقاط الاستلام',
    'mobile.location.body': 'اسمح بالوصول إلى الموقع لترتيب نقاط الاستلام حسب المسافة.',
    'mobile.location.allow': 'السماح بالوصول للموقع',
    'mobile.location.skip': 'الاختيار يدويًا',
    'mobile.location.distanceAway': 'على بُعد {distance}',

    'mobile.rate.title': 'هل يعجبك تطبيق Car Rental؟',
    'mobile.rate.body': 'تقييم سريع يساعد مسافرين آخرين على إيجادنا.',
    'mobile.rate.rate': 'قيّم التطبيق',
    'mobile.rate.later': 'ربما لاحقًا',
    'mobile.rate.never': 'عدم السؤال مجددًا',

    'mobile.update.available': 'يتوفر إصدار جديد',
    'mobile.update.body': 'أعد التشغيل للحصول على أحدث الإصلاحات والميزات.',
    'mobile.update.restart': 'إعادة التشغيل',

    'mobile.settings.title': 'الإعدادات',
    'mobile.settings.appearance': 'المظهر',
    'mobile.settings.language': 'اللغة',
    'mobile.settings.notifications': 'الإشعارات',
    'mobile.settings.security': 'الأمان',
    'mobile.settings.about': 'حول التطبيق',
    'mobile.settings.version': 'الإصدار {version}',
    'mobile.settings.signOutEverywhere': 'تسجيل الخروج من كل الأجهزة',
    'mobile.settings.deleteAccount': 'إغلاق الحساب',

    'mobile.home.greeting': 'إلى أين هذه المرة يا {name}؟',
    'mobile.home.greetingAnon': 'إلى أين هذه المرة؟',
    'mobile.home.recentSearch': 'بحث حديث',
    'mobile.home.quickPickup': 'الاستلام',
    'mobile.home.quickReturn': 'الإرجاع',
    'mobile.home.editSearch': 'تعديل البحث',
    'mobile.home.viewAllLocations': 'كل المواقع',

    'mobile.search.filters': 'الفلاتر',
    'mobile.search.sortBy': 'الترتيب',
    'mobile.search.sort.priceAsc': 'السعر: من الأقل',
    'mobile.search.sort.priceDesc': 'السعر: من الأعلى',
    'mobile.search.sort.recommended': 'موصى به',
    'mobile.search.applyFilters': 'عرض النتائج',
    'mobile.search.resetFilters': 'إعادة ضبط',
    'mobile.search.transmission': 'ناقل الحركة',
    'mobile.search.seats': 'الحد الأدنى للمقاعد',
    'mobile.search.editDates': 'تعديل التواريخ',

    'mobile.picker.pickupLocation': 'موقع الاستلام',
    'mobile.picker.returnLocation': 'موقع الإرجاع',
    'mobile.picker.pickupDate': 'تاريخ الاستلام',
    'mobile.picker.pickupTime': 'وقت الاستلام',
    'mobile.picker.returnDate': 'تاريخ الإرجاع',
    'mobile.picker.returnTime': 'وقت الإرجاع',
    'mobile.picker.done': 'تم',
    'mobile.picker.sameLocation': 'الإرجاع لنفس الموقع',
    'mobile.picker.differentLocation': 'الإرجاع لموقع مختلف',

    'mobile.trips.upcoming': 'القادمة',
    'mobile.trips.active': 'جارية',
    'mobile.trips.past': 'سابقة',
    'mobile.trips.pullToRefresh': 'اسحب للتحديث',
    'mobile.trips.shareReference': 'مشاركة رقم الحجز',

    'mobile.checkout.scanCard': 'مسح البطاقة',
    'mobile.checkout.savedCards': 'البطاقات المحفوظة',
    'mobile.checkout.newCard': 'بطاقة جديدة',
    'mobile.checkout.applePay': 'الدفع عبر Apple Pay',
    'mobile.checkout.googlePay': 'الدفع عبر Google Pay',

    'mobile.deepLink.invalidTitle': 'لم يعمل هذا الرابط',
    'mobile.deepLink.invalidBody': 'تعذّر العثور على الصفحة المطلوبة.',

    'mobile.offline.cannotBook': 'أنت غير متصل — الحجز يتطلب اتصالاً بالإنترنت.',
    'mobile.nav.viewOn': 'فتح في الخرائط',
    'mobile.imagePicker.permissionTitle': 'الوصول إلى الصور مطلوب',
    'mobile.imagePicker.permissionBody': 'اسمح بالوصول إلى مكتبة الصور لإرفاق صورة.',
  },
};
