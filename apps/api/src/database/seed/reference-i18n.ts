import { and, eq } from 'drizzle-orm';

import { LOCATION_PICKUP_SUFFIX, LOCATION_RETURN_SUFFIX } from '../../common/i18n-namespaces';
import { revOf } from '../../common/i18n-source-rev';
import type { Database } from '../drizzle';
import { product, vehicleCategory, vehicleFeature } from '../schema/catalogue';
import { locale, translation } from '../schema/i18n';
import { lookupValue } from '../schema/lookup';
import { location } from '../schema/org';

/**
 * French and Arabic labels for the reference data whose English source lives in the database rather
 * than in a UI bundle: every `lookup:<type>` value, plus the vehicle categories and features.
 * With these seeded, a fresh checkout shows the Translations screen at 100% for en, fr and ar.
 *
 * Shape: `namespace → key → [fr, ar]`. The key is the value's code (a category's description is
 * `<code>.description`). English is the source and is never written here. A key whose English source
 * is not in the database (a value the seed didn't create, a category an operator removed) is
 * skipped, and a value an operator has already translated is left as they wrote it.
 */
type Pair = readonly [fr: string, ar: string];
type Namespaces = Record<string, Record<string, Pair>>;

export const REFERENCE_TRANSLATIONS: Namespaces = {
  'catalogue:category': {
    economy: ['Économique', 'اقتصادية'],
    'economy.description': [
      'Catégorie économique — attribuée à partir de la catégorie au retrait.',
      'فئة اقتصادية — تُخصَّص المركبة من الفئة عند الاستلام.',
    ],
    compact: ['Compacte', 'صغيرة'],
    'compact.description': [
      'Catégorie compacte — attribuée à partir de la catégorie au retrait.',
      'فئة صغيرة — تُخصَّص المركبة من الفئة عند الاستلام.',
    ],
    intermediate: ['Intermédiaire', 'متوسطة'],
    'intermediate.description': [
      'Catégorie intermédiaire — attribuée à partir de la catégorie au retrait.',
      'فئة متوسطة — تُخصَّص المركبة من الفئة عند الاستلام.',
    ],
    suv: ['SUV', 'دفع رباعي'],
    'suv.description': [
      'Catégorie SUV — attribuée à partir de la catégorie au retrait.',
      'فئة الدفع الرباعي — تُخصَّص المركبة من الفئة عند الاستلام.',
    ],
    premium: ['Premium', 'فاخرة'],
    'premium.description': [
      'Catégorie premium — attribuée à partir de la catégorie au retrait.',
      'فئة فاخرة — تُخصَّص المركبة من الفئة عند الاستلام.',
    ],
  },
  'catalogue:feature': {
    aircon: ['Climatisation', 'تكييف الهواء'],
    awd: ['Transmission intégrale', 'دفع رباعي'],
    bluetooth: ['Bluetooth', 'بلوتوث'],
    carplay: ['Apple CarPlay / Android Auto', 'Apple CarPlay / Android Auto'],
    cruise: ['Régulateur de vitesse', 'مثبّت السرعة'],
    gps: ['Navigation intégrée', 'نظام ملاحة مدمج'],
    leather: ['Sièges en cuir', 'مقاعد جلدية'],
    parking_sensors: ['Aide au stationnement', 'حساسات ركن السيارة'],
  },
  'catalogue:location': {
    JFK: ['Aéroport JFK de New York', 'مطار جون كينيدي (JFK) في نيويورك'],
    'JFK.pickup': [
      'Rendez-vous au comptoir de location dans le hall des arrivées avec votre référence de réservation et votre permis de conduire.',
      'توجّه إلى مكتب التأجير في صالة الوصول مع رقم الحجز ورخصة القيادة.',
    ],
    'JFK.return': [
      'Rendez le véhicule dans la zone de retour signalée. Gardez la clé et remplissez la fiche de contrôle.',
      'أعد السيارة إلى منطقة الإعادة المخصّصة. احتفظ بالمفتاح وأكمل قائمة الفحص.',
    ],
    LHR: ['Aéroport de Londres Heathrow', 'مطار لندن هيثرو'],
    'LHR.pickup': [
      'Rendez-vous au comptoir de location dans le hall des arrivées avec votre référence de réservation et votre permis de conduire.',
      'توجّه إلى مكتب التأجير في صالة الوصول مع رقم الحجز ورخصة القيادة.',
    ],
    'LHR.return': [
      'Rendez le véhicule dans la zone de retour signalée. Gardez la clé et remplissez la fiche de contrôle.',
      'أعد السيارة إلى منطقة الإعادة المخصّصة. احتفظ بالمفتاح وأكمل قائمة الفحص.',
    ],
    PAR: ['Paris centre — Opéra', 'وسط باريس — الأوبرا'],
    'PAR.pickup': [
      'Rendez-vous au comptoir de location dans le hall des arrivées avec votre référence de réservation et votre permis de conduire.',
      'توجّه إلى مكتب التأجير في صالة الوصول مع رقم الحجز ورخصة القيادة.',
    ],
    'PAR.return': [
      'Rendez le véhicule dans la zone de retour signalée. Gardez la clé et remplissez la fiche de contrôle.',
      'أعد السيارة إلى منطقة الإعادة المخصّصة. احتفظ بالمفتاح وأكمل قائمة الفحص.',
    ],
    TST1: ['Site de test 1 (24 h/24)', 'موقع الاختبار 1 (على مدار الساعة)'],
    TST2: [
      'Site de test 2 (horaires limités, pas de retour hors horaires)',
      'موقع الاختبار 2 (ساعات محدودة، بدون إعادة خارج أوقات الدوام)',
    ],
  },
  'catalogue:product': {
    protection_full: ['Protection complète (franchise zéro)', 'حماية شاملة (بدون تحمّل)'],
    protection_basic: [
      'Exonération de dommages en cas de collision',
      'التنازل عن مسؤولية أضرار التصادم',
    ],
    additional_driver: ['Conducteur supplémentaire', 'سائق إضافي'],
    child_seat: ['Siège enfant', 'مقعد أطفال'],
    gps: ['Navigation GPS', 'نظام ملاحة GPS'],
  },
  'lookup:adjustment_reason': {
    cleaning: ['Nettoyage', 'تنظيف'],
    damage: ['Dommage', 'ضرر'],
    excess_distance: ['Kilométrage excédentaire', 'مسافة زائدة'],
    fine: ['Contravention', 'مخالفة مرورية'],
    fuel_difference: ['Écart de carburant / de charge', 'فرق الوقود / الشحن'],
    goodwill_credit: ['Geste commercial', 'رصيد مجاملة'],
    late_return: ['Retour tardif', 'تأخر في الإرجاع'],
    one_way_change: ['Changement de trajet aller simple', 'تغيير الرحلة باتجاه واحد'],
    toll: ['Péage', 'رسوم طريق'],
  },
  'lookup:block_reason': {
    damage: ['Dommage', 'ضرر'],
    internal_use: ['Usage interne', 'استخدام داخلي'],
    maintenance: ['Maintenance', 'صيانة'],
    operational_buffer: ['Marge opérationnelle', 'هامش تشغيلي'],
    regulatory: ['Restriction réglementaire', 'قيد تنظيمي'],
  },
  'lookup:cancel_reason': {
    booked_by_mistake: ['Réservé par erreur', 'حُجز عن طريق الخطأ'],
    customer_request: ['À la demande du client', 'بناءً على طلب العميل'],
    duplicate: ['Réservation en double', 'حجز مكرر'],
    found_better_price: ['A trouvé un meilleur prix', 'وجد سعرًا أفضل'],
    goodwill: ['Geste commercial / rattrapage de service', 'مجاملة / تعويض عن الخدمة'],
    no_show: ['Absence du client', 'عدم حضور العميل'],
    other: ['Autre', 'أخرى'],
    payment_failed: ['Échec du paiement', 'فشل الدفع'],
    plans_changed: ['Changement de projets', 'تغيّرت الخطط'],
    trip_cancelled: ['Voyage annulé', 'أُلغيت الرحلة'],
  },
  'lookup:case_reason': {
    billing_question: ['Question de facturation', 'استفسار عن الفوترة'],
    charge_dispute: ['Contestation d’un débit', 'نزاع على رسوم'],
    complaint: ['Réclamation', 'شكوى'],
    data_request: ['Demande de données', 'طلب بيانات'],
    lost_property: ['Objet perdu', 'مفقودات'],
  },
  'lookup:charge_type': {
    additional_driver_fee: ['Frais de conducteur supplémentaire', 'رسوم سائق إضافي'],
    airport_fee: ['Redevance aéroportuaire', 'رسوم امتياز المطار'],
    base_rate: ['Location de base', 'الإيجار الأساسي'],
    excess_mileage: ['Kilométrage excédentaire', 'مسافة زائدة'],
    late_return_fee: ['Frais de retour tardif', 'رسوم التأخر في الإرجاع'],
    one_way_fee: ['Frais d’aller simple', 'رسوم الاتجاه الواحد'],
    refuelling: ['Ravitaillement', 'تعبئة الوقود'],
    security_deposit: ['Dépôt de garantie', 'وديعة ضمان'],
    vat: ['TVA / taxe de vente', 'ضريبة القيمة المضافة / المبيعات'],
    young_driver_fee: ['Frais de jeune conducteur', 'رسوم السائق الشاب'],
  },
  'lookup:cleaning_maint_type': {
    deep_clean: ['Nettoyage en profondeur', 'تنظيف عميق'],
    recall: ['Rappel constructeur', 'استدعاء من الشركة المصنّعة'],
    repair: ['Réparation', 'إصلاح'],
    scheduled_service: ['Entretien programmé', 'صيانة مجدولة'],
    standard_clean: ['Nettoyage standard', 'تنظيف عادي'],
    tyre_change: ['Changement de pneus', 'تغيير الإطارات'],
  },
  'lookup:country': {
    AE: ['Émirats arabes unis', 'الإمارات العربية المتحدة'],
    CA: ['Canada', 'كندا'],
    DE: ['Allemagne', 'ألمانيا'],
    FR: ['France', 'فرنسا'],
    GB: ['Royaume-Uni', 'المملكة المتحدة'],
    US: ['États-Unis', 'الولايات المتحدة'],
  },
  'lookup:currency': {
    AED: ['Dirham des É.A.U.', 'درهم إماراتي'],
    CAD: ['Dollar canadien', 'دولار كندي'],
    EUR: ['Euro', 'يورو'],
    GBP: ['Livre sterling', 'جنيه إسترليني'],
    USD: ['Dollar américain', 'دولار أمريكي'],
  },
  'lookup:damage_finding': {
    chip: ['Éclat', 'رقاقة / تشظٍّ'],
    dent: ['Bosse', 'انبعاج'],
    interior_stain: ['Tache intérieure', 'بقعة في الداخل'],
    mechanical: ['Panne mécanique', 'عطل ميكانيكي'],
    missing_part: ['Pièce manquante', 'قطعة مفقودة'],
    scratch: ['Rayure', 'خدش'],
  },
  'lookup:delivery_state': {
    delivered: ['Distribué', 'تم التسليم'],
    failed: ['Échec', 'فشل'],
    queued: ['En file d’attente', 'في قائمة الانتظار'],
    retried: ['Nouvelle tentative', 'أُعيدت المحاولة'],
    sent: ['Envoyé', 'أُرسل'],
    suppressed: ['Supprimé', 'مكبوت'],
  },
  'lookup:discount_type': {
    length_of_rental: ['Remise selon la durée de location', 'خصم حسب مدة الإيجار'],
    promo_code: ['Code promotionnel', 'رمز ترويجي'],
    seasonal: ['Offre saisonnière', 'عرض موسمي'],
    segment: ['Remise par segment de clientèle', 'خصم حسب فئة العملاء'],
  },
  'lookup:document_type': {
    driver_licence: ['Permis de conduire', 'رخصة القيادة'],
    id_card: ['Carte nationale d’identité', 'بطاقة الهوية الوطنية'],
    insurance_certificate: ['Attestation d’assurance', 'شهادة التأمين'],
    passport: ['Passeport', 'جواز السفر'],
    proof_of_address: ['Justificatif de domicile', 'إثبات العنوان'],
    vehicle_registration: ['Carte grise', 'ترخيص المركبة'],
  },
  'lookup:incident_state': {
    active_response: ['Intervention en cours', 'استجابة نشطة'],
    closed: ['Clôturé', 'مغلق'],
    investigation: ['Enquête', 'قيد التحقيق'],
    reported: ['Signalé', 'تم الإبلاغ'],
    resolved: ['Résolu', 'تمت المعالجة'],
    triaged: ['Trié', 'تم الفرز'],
  },
  'lookup:incident_type': {
    collision: ['Collision', 'اصطدام'],
    glass_damage: ['Bris de glace', 'تلف الزجاج'],
    mechanical_breakdown: ['Panne mécanique', 'عطل ميكانيكي'],
    other: ['Autre', 'أخرى'],
    theft: ['Vol', 'سرقة'],
    tyre: ['Pneu / roue', 'إطار / عجلة'],
    vandalism: ['Vandalisme', 'تخريب'],
  },
  'lookup:inspection_state': {
    due: ['À faire', 'مستحقة'],
    failed: ['Non conforme', 'غير مجتازة'],
    in_progress: ['En cours', 'قيد التنفيذ'],
    needs_review: ['À vérifier', 'تحتاج مراجعة'],
    passed: ['Conforme', 'مجتازة'],
    superseded: ['Remplacée', 'مستبدلة'],
  },
  'lookup:licence_type': {
    car_automatic: ['Voiture — boîte automatique uniquement', 'سيارة — ناقل حركة أوتوماتيكي فقط'],
    car_b: ['Voiture (catégorie B)', 'سيارة (الفئة B)'],
    motorcycle_a: ['Moto (A)', 'دراجة نارية (A)'],
    van_c1: ['Petite camionnette (C1)', 'شاحنة صغيرة (C1)'],
  },
  'lookup:maintenance_state': {
    cancelled: ['Annulée', 'ملغاة'],
    closed: ['Clôturée', 'مغلقة'],
    completed: ['Terminée', 'مكتملة'],
    draft: ['Brouillon', 'مسودة'],
    in_progress: ['En cours', 'قيد التنفيذ'],
    scheduled: ['Planifiée', 'مجدولة'],
  },
  'lookup:no_show_reason': {
    contact_failed: ['Client injoignable', 'تعذّر الوصول إلى العميل'],
    customer_did_not_arrive: ['Le client ne s’est pas présenté', 'لم يحضر العميل'],
    grace_period_elapsed: ['Délai de grâce écoulé', 'انقضت فترة السماح'],
  },
  'lookup:notification_event': {
    account_recovery: ['Récupération de compte', 'استعادة الحساب'],
    account_verification: ['Vérification du compte', 'التحقق من الحساب'],
    extension_decision: ['Décision de prolongation', 'قرار التمديد'],
    incident_update: ['Mise à jour d’incident', 'تحديث الحادث'],
    payment_receipt: ['Reçu de paiement', 'إيصال الدفع'],
    pickup_reminder: ['Rappel de retrait', 'تذكير بالاستلام'],
    privacy_request_closed: ['Compte clos', 'إغلاق الحساب'],
    privacy_request_completed: ['Demande de données terminée', 'اكتمال طلب البيانات'],
    privacy_request_rejected: ['Demande de données refusée', 'رفض طلب البيانات'],
    refund_status: ['Statut du remboursement', 'حالة الاسترداد'],
    reservation_cancelled: ['Réservation annulée', 'إلغاء الحجز'],
    reservation_confirmed: ['Réservation confirmée', 'تأكيد الحجز'],
    reservation_modified: ['Réservation modifiée', 'تعديل الحجز'],
    return_reminder: ['Rappel de retour', 'تذكير بالإرجاع'],
    security_alert: ['Alerte de sécurité', 'تنبيه أمني'],
  },
  'lookup:override_reason': {
    documented_exception: ['Exception commerciale documentée', 'استثناء تجاري موثّق'],
    manager_goodwill: ['Geste commercial du responsable', 'مجاملة من المدير'],
    pricing_error_correction: ['Correction d’une erreur de prix', 'تصحيح خطأ في التسعير'],
    service_recovery: ['Rattrapage de service', 'تعويض عن الخدمة'],
  },
  'lookup:payment_method': {
    amex: ['American Express', 'أمريكان إكسبريس'],
    mastercard: ['Mastercard', 'ماستركارد'],
    sim_card: ['Carte de test (simulateur)', 'بطاقة اختبار (محاكي)'],
    visa: ['Visa', 'فيزا'],
  },
  'lookup:payment_state': {
    action_required: ['Action requise', 'يتطلب إجراءً'],
    authorized: ['Autorisé', 'مصرَّح به'],
    cancelled: ['Annulé', 'ملغى'],
    captured: ['Encaissé', 'تم التحصيل'],
    created: ['Créé', 'تم الإنشاء'],
    expired: ['Expiré', 'منتهي'],
    failed: ['Échec', 'فشل'],
    partially_captured: ['Partiellement encaissé', 'تم التحصيل جزئيًا'],
    processing: ['En cours de traitement', 'قيد المعالجة'],
    unknown: ['Inconnu', 'غير معروف'],
  },
  'lookup:permission_action': {
    'audit.manage': [
      'Prendre en compte / résoudre les constats de qualité des données — distinct de audit.read (SRS-SEC-007 : une permission de lecture ne doit jamais déverrouiller une écriture)',
      'الإقرار بنتائج جودة البيانات ومعالجتها — منفصلة عن audit.read (SRS-SEC-007: يجب ألا تمنح صلاحية القراءة صلاحية الكتابة)',
    ],
    'audit.read': ['Consulter l’audit et la qualité des données', 'عرض التدقيق وجودة البيانات'],
    'catalogue.manage': [
      'Gérer les catégories de véhicules, les caractéristiques et les grilles tarifaires',
      'إدارة فئات المركبات وميزاتها وخطط الأسعار',
    ],
    'catalogue.read': [
      'Consulter le catalogue, les sites et la disponibilité',
      'عرض الكتالوج والمواقع والتوفر',
    ],
    'config.publish': [
      'Publier les versions des tarifs, politiques, produits et modèles',
      'نشر إصدارات الأسعار والسياسات والمنتجات والقوالب',
    ],
    'config.read': ['Consulter la configuration', 'عرض الإعدادات'],
    'customer.manage': [
      'Modifier les données clients, les restrictions et les fusions',
      'تعديل بيانات العملاء والقيود ودمج السجلات',
    ],
    'customer.read': ['Consulter les fiches clients', 'عرض سجلات العملاء'],
    'email.manage': [
      'Configurer le fournisseur d’e-mail (hôte / identifiants SMTP, bascule boîte d’envoi / production) — volontairement exclu du « toutes permissions » de tout autre rôle ; seul `administrator` la détient.',
      'إعداد مزود البريد الإلكتروني (مضيف SMTP وبيانات الاعتماد، والتبديل بين صندوق الصادر والبث الفعلي) — مستثناة عمدًا من «كل الصلاحيات» في أي دور آخر؛ يملكها `administrator` وحده.',
    ],
    'fleet.manage': [
      'Gérer les véhicules, les transferts, la maintenance et les blocages',
      'إدارة المركبات والنقل والصيانة وحالات الحجب',
    ],
    'fleet.read': ['Consulter la flotte', 'عرض الأسطول'],
    'integration.manage': [
      'Gérer l’état et la reprise des intégrations',
      'إدارة سلامة التكاملات واستعادتها',
    ],
    'lookup.manage': ['Gérer les valeurs des données de référence', 'إدارة قيم البيانات المرجعية'],
    'payment.manage': [
      'Configurer le fournisseur de paiement (clés Stripe, bascule test / production) — volontairement exclu du « toutes permissions » de tout autre rôle ; seul `administrator` la détient. Qui peut changer la destination de l’argent est une liste plus restreinte que celle de qui peut tout faire d’autre.',
      'إعداد مزود الدفع (مفاتيح Stripe، والتبديل بين الاختبار والبث الفعلي) — مستثناة عمدًا من «كل الصلاحيات» في أي دور آخر؛ يملكها `administrator` وحده. من يستطيع تغيير وجهة الأموال قائمة أضيق ممّن يستطيع كل ما عداه.',
    ],
    'payment.read': ['Consulter les paiements et les reçus', 'عرض المدفوعات والإيصالات'],
    'payment.reconcile': ['Résoudre les écarts de rapprochement', 'معالجة استثناءات التسوية'],
    'payment.refund': ['Effectuer des remboursements', 'إصدار عمليات الاسترداد'],
    'rental.extend.approve': [
      'Approuver les demandes de prolongation',
      'الموافقة على طلبات التمديد',
    ],
    'rental.pickup': [
      'Effectuer les retraits / ouvrir les locations',
      'تنفيذ الاستلام / فتح الإيجارات',
    ],
    'rental.read': ['Consulter les locations', 'عرض الإيجارات'],
    'rental.return': [
      'Réceptionner les retours / clôturer les locations',
      'استلام المركبات المرتجعة / إغلاق الإيجارات',
    ],
    'report.export': ['Exporter / planifier des rapports', 'تصدير التقارير / جدولتها'],
    'report.read': ['Consulter les rapports', 'عرض التقارير'],
    'reservation.cancel': ['Annuler des réservations', 'إلغاء الحجوزات'],
    'reservation.create': [
      'Créer des réservations (réservation assistée)',
      'إنشاء حجوزات (حجز بمساعدة الموظف)',
    ],
    'reservation.modify': ['Modifier des réservations', 'تعديل الحجوزات'],
    'reservation.override': [
      'Appliquer des exceptions aux règles modifiables',
      'تطبيق استثناءات على القواعد القابلة للتجاوز',
    ],
    'reservation.read': ['Consulter les réservations', 'عرض الحجوزات'],
    'staff.manage': [
      'Gérer les comptes du personnel, les rôles et les périmètres',
      'إدارة حسابات الموظفين والأدوار ونطاقات الوصول',
    ],
    'workflow.manage': [
      'Créer, modifier et publier les workflows de validation, et choisir l’action que chacun encadre',
      'إنشاء مسارات الموافقة وتعديلها ونشرها واختيار الإجراء الذي يحكمه كل مسار',
    ],
    'workflow.monitor': [
      'Voir toutes les demandes de validation, réaffecter une tâche, annuler ou forcer une demande (audité)',
      'عرض كل طلبات الموافقة وإعادة إسناد المهام وإلغاء الطلب أو تمريره قسرًا (مع التدقيق)',
    ],
  },
  'lookup:readiness_outcome': {
    needs_review: ['À vérifier', 'تحتاج مراجعة'],
    not_ready: ['Pas prêt', 'غير جاهزة'],
    ready: ['Prêt', 'جاهزة'],
  },
  'lookup:reconciliation_state': {
    escalated: ['Escaladé', 'تم التصعيد'],
    investigating: ['En cours d’analyse', 'قيد التحقيق'],
    open: ['Ouvert', 'مفتوح'],
    resolved_compensated: ['Résolu — compensé', 'تمت المعالجة — بتعويض'],
    resolved_explained: ['Résolu — expliqué', 'تمت المعالجة — مع توضيح'],
    resolved_linked: ['Résolu — rattaché', 'تمت المعالجة — بالربط'],
  },
  'lookup:refund_reason': {
    goodwill: ['Geste commercial', 'مجاملة'],
    overcharge_correction: ['Correction d’un trop-perçu', 'تصحيح مبلغ زائد'],
    policy_cancellation: ['Annulation selon la politique', 'إلغاء وفق السياسة'],
    service_failure: ['Défaillance de service', 'إخفاق في الخدمة'],
  },
  'lookup:refund_state': {
    cancelled: ['Annulé', 'ملغى'],
    failed: ['Échec', 'فشل'],
    manual_review: ['Vérification manuelle', 'مراجعة يدوية'],
    processing: ['En cours de traitement', 'قيد المعالجة'],
    requested: ['Demandé', 'تم الطلب'],
    succeeded: ['Réussi', 'نجح'],
  },
  'lookup:rental_state': {
    active_extended: ['Actif — prolongé', 'نشط — ممدَّد'],
    active: ['Actif', 'نشط'],
    completed: ['Terminé', 'مكتمل'],
    financial_review: ['Vérification financière', 'مراجعة مالية'],
    incident_review: ['Examen d’incident', 'مراجعة الحادث'],
    opening_pending: ['Ouverture en attente', 'الفتح قيد الانتظار'],
    overdue: ['En retard', 'متأخر'],
    replacement_in_progress: ['Remplacement en cours', 'الاستبدال قيد التنفيذ'],
    return_started: ['Retour entamé', 'بدأ الإرجاع'],
    returned_pending_inspection: ['Restitué — inspection en attente', 'تم الإرجاع — بانتظار الفحص'],
    terminated_review: ['Résilié — à vérifier', 'أُنهي — قيد المراجعة'],
  },
  'lookup:reservation_state': {
    cancelled: ['Annulée', 'ملغى'],
    confirmed: ['Confirmée', 'مؤكد'],
    draft_checkout: ['Paiement en cours', 'مسودة الدفع'],
    expired: ['Expirée', 'منتهي'],
    modified_confirmed: ['Modifiée et confirmée', 'معدَّل ومؤكد'],
    no_show: ['Non présenté', 'لم يحضر'],
    pending_prerequisite: ['Prérequis en attente', 'بانتظار متطلب مسبق'],
    pickup_ready: ['Prête pour le retrait', 'جاهز للاستلام'],
    rental_opened: ['Location ouverte', 'فُتح الإيجار'],
  },
  'lookup:restriction_reason': {
    behavioural: ['Problème de comportement ou de sécurité', 'مخاوف تتعلق بالسلوك أو السلامة'],
    chargeback: ['Rejet de paiement (rétrofacturation)', 'استرداد مبلغ من المصرف'],
    complaint: ['Réclamation ou litige', 'شكوى أو نزاع'],
    damage_history: ['Dommages ou recouvrements antérieurs', 'أضرار أو مطالبات سابقة'],
    document_expired: ['Document obligatoire expiré', 'مستند مطلوب منتهي الصلاحية'],
    fraud_indicators: ['Fraude suspectée', 'اشتباه في احتيال'],
    licence_issue: ['Problème de permis / pièce d’identité', 'مشكلة في الرخصة / الهوية'],
    other: ['Autre (voir les justificatifs)', 'أخرى (انظر الأدلة)'],
    unpaid_balance: ['Solde impayé', 'رصيد غير مسدد'],
  },
  'lookup:security_hold_state': {
    adjusted: ['Ajustée', 'معدّلة'],
    authorized: ['Autorisée', 'مصرَّح بها'],
    expired: ['Expirée', 'منتهية'],
    failed: ['Échec', 'فشلت'],
    partially_captured: ['Partiellement encaissée', 'تم تحصيلها جزئيًا'],
    pending: ['En attente', 'قيد الانتظار'],
    released: ['Libérée', 'تم الإفراج عنها'],
    required: ['Requise', 'مطلوبة'],
  },
  'lookup:time_zone': {
    'America/Los_Angeles': ['Amérique/Los_Angeles', 'أمريكا/لوس أنجلوس'],
    'America/New_York': ['Amérique/New_York', 'أمريكا/نيويورك'],
    'Asia/Dubai': ['Asie/Dubaï', 'آسيا/دبي'],
    'Europe/London': ['Europe/Londres', 'أوروبا/لندن'],
    'Europe/Paris': ['Europe/Paris', 'أوروبا/باريس'],
  },
  'lookup:transfer_reason': {
    demand_balancing: ['Équilibrage de la demande', 'موازنة الطلب'],
    maintenance_facility: ['Transfert vers l’atelier', 'النقل إلى مركز الصيانة'],
    one_way_return: ['Repositionnement après aller simple', 'إعادة التموضع بعد رحلة باتجاه واحد'],
  },
  'lookup:vehicle_feature': {
    air_conditioning: ['Climatisation', 'تكييف الهواء'],
    android_auto: ['Android Auto', 'Android Auto'],
    apple_carplay: ['Apple CarPlay', 'Apple CarPlay'],
    bluetooth: ['Bluetooth', 'بلوتوث'],
    cruise_control: ['Régulateur de vitesse', 'مثبّت السرعة'],
    heated_seats: ['Sièges chauffants', 'مقاعد مدفأة'],
    parking_sensors: ['Aide au stationnement', 'حساسات ركن السيارة'],
    reversing_camera: ['Caméra de recul', 'كاميرا خلفية'],
    roof_rails: ['Barres de toit', 'قضبان السقف'],
    tow_bar: ['Attelage', 'وصلة سحب'],
    wheelchair_access: ['Accès pour fauteuil roulant', 'إمكانية وصول الكراسي المتحركة'],
  },
  'lookup:vehicle_state': {
    available: ['Disponible', 'متاحة'],
    cleaning: ['Nettoyage', 'قيد التنظيف'],
    damage_review: ['Examen des dommages', 'مراجعة الأضرار'],
    draft: ['Brouillon', 'مسودة'],
    held_assigned: ['Réservé et affecté', 'محجوزة ومخصَّصة'],
    maintenance: ['Maintenance', 'صيانة'],
    on_rent: ['En location', 'مؤجَّرة'],
    pickup_ready: ['Prêt pour le retrait', 'جاهزة للاستلام'],
    retired: ['Retiré', 'خارج الخدمة'],
    returned_pending_inspection: ['Restitué — inspection en attente', 'تم الإرجاع — بانتظار الفحص'],
    transfer: ['Transfert', 'قيد النقل'],
    unavailable: ['Indisponible', 'غير متاحة'],
  },
};

/** The English source of a key, read from the database rows the seed has already created. */
async function englishSource(db: Database, namespace: string, key: string): Promise<string | null> {
  if (namespace.startsWith('lookup:')) {
    const [row] = await db
      .select({ label: lookupValue.defaultLabel })
      .from(lookupValue)
      .where(
        and(eq(lookupValue.typeCode, namespace.slice('lookup:'.length)), eq(lookupValue.code, key)),
      )
      .limit(1);
    return row?.label ?? null;
  }
  if (namespace === 'catalogue:category') {
    const isDescription = key.endsWith('.description');
    const code = isDescription ? key.slice(0, -'.description'.length) : key;
    const [row] = await db
      .select({ name: vehicleCategory.displayName, description: vehicleCategory.description })
      .from(vehicleCategory)
      .where(eq(vehicleCategory.code, code))
      .limit(1);
    return (isDescription ? row?.description : row?.name) ?? null;
  }
  if (namespace === 'catalogue:location') {
    const isPickup = key.endsWith(LOCATION_PICKUP_SUFFIX);
    const isReturn = key.endsWith(LOCATION_RETURN_SUFFIX);
    const code = isPickup
      ? key.slice(0, -LOCATION_PICKUP_SUFFIX.length)
      : isReturn
        ? key.slice(0, -LOCATION_RETURN_SUFFIX.length)
        : key;
    const [row] = await db
      .select({
        name: location.name,
        pickup: location.pickupInstructions,
        ret: location.returnInstructions,
      })
      .from(location)
      .where(eq(location.code, code))
      .limit(1);
    return (isPickup ? row?.pickup : isReturn ? row?.ret : row?.name) ?? null;
  }
  if (namespace === 'catalogue:product') {
    const [row] = await db
      .select({ name: product.name })
      .from(product)
      .where(eq(product.code, key))
      .limit(1);
    return row?.name ?? null;
  }
  if (namespace === 'catalogue:feature') {
    const [row] = await db
      .select({ label: vehicleFeature.label })
      .from(vehicleFeature)
      .where(eq(vehicleFeature.code, key))
      .limit(1);
    return row?.label ?? null;
  }
  return null;
}

/**
 * Publishes the French and Arabic labels above. Idempotent: a re-run leaves anything an operator has
 * already translated (or edited) alone, and stamps each row with the hash of the English source so
 * the catalogue shows it as current rather than outdated.
 */
export async function seedReferenceTranslations(db: Database): Promise<number> {
  let written = 0;
  for (const [namespace, entries] of Object.entries(REFERENCE_TRANSLATIONS)) {
    for (const [key, [fr, ar]] of Object.entries(entries)) {
      const en = await englishSource(db, namespace, key);
      if (en === null) continue;
      for (const [localeCode, value] of [
        ['fr', fr],
        ['ar', ar],
      ] as const) {
        const inserted = await db
          .insert(translation)
          .values({
            namespace,
            key,
            localeCode,
            value,
            publishedValue: value,
            status: 'published',
            sourceRevision: revOf(en),
          })
          .onConflictDoNothing({
            target: [translation.namespace, translation.key, translation.localeCode],
          })
          .returning({ id: translation.id });
        written += inserted.length;
      }
    }
  }
  return written + (await seedCurrencyNames(db));
}

/**
 * The name of every currency in the reference data, in every active language, from the runtime's own
 * ICU data — so a currency added from the dashboard is already named in every language and shows
 * as translated (not missing) on the Translations screen. Only fills gaps: the five starter
 * currencies keep their hand-written names above, and an operator's own wording is never replaced.
 */
async function seedCurrencyNames(db: Database): Promise<number> {
  const values = await db
    .select({ code: lookupValue.code, label: lookupValue.defaultLabel })
    .from(lookupValue)
    .where(eq(lookupValue.typeCode, 'currency'));
  // every language that is switched on, not only the launch three — a dashboard-added one too
  const localeCodes = (
    await db.select({ code: locale.code }).from(locale).where(eq(locale.isActive, true))
  )
    .map((l) => l.code)
    .filter((c) => c !== 'en');
  let written = 0;
  for (const localeCode of localeCodes) {
    let names: Intl.DisplayNames;
    try {
      names = new Intl.DisplayNames([localeCode], { type: 'currency' });
    } catch {
      continue;
    }
    for (const v of values) {
      const value = names.of(v.code);
      if (!value || value === v.code) continue;
      const inserted = await db
        .insert(translation)
        .values({
          namespace: 'lookup:currency',
          key: v.code,
          localeCode,
          value,
          publishedValue: value,
          status: 'published',
          sourceRevision: revOf(v.label),
        })
        .onConflictDoNothing({
          target: [translation.namespace, translation.key, translation.localeCode],
        })
        .returning({ id: translation.id });
      written += inserted.length;
    }
  }
  return written;
}
