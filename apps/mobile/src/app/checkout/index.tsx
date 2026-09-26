import type { ConfirmBookingRequest } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { CardField, useStripe } from '@stripe/stripe-react-native';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Minus, Plus } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CheckoutConfirmation } from '../../components/checkout/confirmation-view';
import { AppStateView, Badge, Button, Card, Divider, Field, Input, Screen, SegmentedControl, Text } from '../../components/ui';
import {
  formatMinor,
  useAvailableProducts,
  useConfirmBooking,
  usePaymentMode,
  useQuoteByRef,
  type CatalogueProduct,
  type ReservationResult,
} from '../../lib/api/hooks/use-discovery';
import { useFormErrors } from '../../lib/api/hooks/use-form-errors';
import { ApiError } from '../../lib/api/query-client';
import { useAuth } from '../../lib/auth/auth-provider';
import { StripeGate } from '../../lib/payments/stripe-gate';
import { useTheme } from '../../lib/theme/theme-provider';
import { toHexColor } from '../../lib/theme/tokens';
import { useTripDraft } from '../../lib/trip/trip-draft-store';


const TEST_CARD_TOKENS = ['tok_visa_ok', 'tok_mastercard_ok', 'tok_decline'] as const;
type CardToken = (typeof TEST_CARD_TOKENS)[number];
const CARD_LABEL_KEY: Record<CardToken, string> = {
  tok_visa_ok: 'checkout.card.visa',
  tok_mastercard_ok: 'checkout.card.mastercard',
  tok_decline: 'checkout.card.decline',
};

export default function CheckoutScreen() {
  const { t, locale } = useI18n();
  const { colors, space } = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const { status, actor } = useAuth();
  const draft = useTripDraft();

  const quote = useQuoteByRef(reference ?? null);
  // extras are priced in one currency and a booking is in one — offer only those in the quote's
  const products = useAvailableProducts(
    quote.data?.categoryCode ?? null,
    quote.data?.pickupLocationCode ?? null,
    quote.data?.currency ?? null,
  );
  const mode = usePaymentMode();
  const confirm = useConfirmBooking();
  const formErrors = useFormErrors();

  const [fullName, setFullName] = useState(actor?.displayName ?? '');
  const [email, setEmail] = useState('');
  const [licence, setLicence] = useState('');
  const [card, setCard] = useState<CardToken>('tok_visa_ok');
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [accepted, setAccepted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [result, setResult] = useState<ReservationResult | null>(null);
  const [driverError, setDriverError] = useState<string | null>(null);

  useEffect(() => {
    const iso = quote.data?.hold?.expiresAt ?? quote.data?.expiresAt;
    if (!iso) return;
    const target = new Date(iso).getTime();
    const tick = () => setSecondsLeft(Math.round((target - Date.now()) / 1000));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [quote.data]);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !result });
  }, [navigation, result]);

  const expired = secondsLeft != null && secondsLeft <= 0;
  const billableDays = Math.max(1, Math.ceil((quote.data?.durationHours ?? 24) / 24));

  const extraCodes = useMemo(
    () => Object.entries(extras).flatMap(([code, qty]) => Array.from({ length: qty }, () => code)),
    [extras],
  );
  const extrasEstimateMinor = useMemo(() => {
    const byCode = new Map(
      (products.data ?? []).map((p) => [p.code, p.unitPriceMinor * (p.pricingUnit === 'per_day' ? billableDays : 1)]),
    );
    return Object.entries(extras).reduce((sum, [code, qty]) => sum + (byCode.get(code) ?? 0) * qty, 0);
  }, [extras, products.data, billableDays]);

  const totalWithExtrasMinor = (quote.data?.totalMinor ?? 0) + extrasEstimateMinor;
  const payLabel = quote.data
    ? t('checkout.payConfirm', { amount: formatMinor(totalWithExtrasMinor, quote.data.currency, locale) })
    : '';

  function validateDriver(): boolean {
    setDriverError(null);
    formErrors.clear();
    if (!fullName.trim()) {
      setDriverError(t('checkout.enterDriverName'));
      return false;
    }
    if (!accepted) return false;
    return true;
  }

  async function doConfirm(token: string) {
    if (!reference) return;
    formErrors.clear();
    const body: ConfirmBookingRequest = {
      quoteReference: reference,
      drivers: [
        {
          role: 'primary_renter',
          fullName: fullName.trim(),
          email: email || undefined,
          licenceNumber: licence || undefined,
        },
      ],
      acceptTerms: true,
      paymentToken: token,
      extraCodes: extraCodes.length ? extraCodes : undefined,
    };
    try {
      const r = await confirm.mutateAsync(body);
      setResult(r);
      draft.clear();
    } catch (err) {
      if (err instanceof ApiError) formErrors.fromError(err);
    }
  }

  if (result) {
    return (
      <Screen scroll>
        <Stack.Screen options={{ title: t('checkout.confirmedTitle'), headerBackVisible: false }} />
        <CheckoutConfirmation result={result} authed={status === 'authenticated'} />
      </Screen>
    );
  }

  return (
    <Screen scroll keyboardAvoiding contentContainerStyle={{ gap: space(5) }}>
      <Stack.Screen options={{ title: t('checkout.title') }} />

      {!reference || quote.isError ? (
        <AppStateView
          kind="failure"
          title={t('checkout.quoteGone')}
          primaryAction={{ label: t('checkout.startNewSearch'), onPress: () => router.push('/search') }}
        />
      ) : quote.isLoading || !quote.data ? (
        <AppStateView kind="loading" title={t('checkout.loadingQuote')} />
      ) : (
        <>
          <Card style={{ gap: space(2) }}>
            <Text variant="h3">
              {quote.data.categoryCode} · {quote.data.pickupLocationCode} → {quote.data.returnLocationCode}
            </Text>
            {quote.data.lines.map((l) => (
              <View key={l.code} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="small" color="mutedForeground">
                  {l.label}
                </Text>
                <Text variant="small">{formatMinor(l.amountMinor, quote.data!.currency, locale)}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: space(2), borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text variant="bodyStrong">{t('checkout.total')}</Text>
              <Text variant="bodyStrong">{formatMinor(quote.data.totalMinor, quote.data.currency, locale)}</Text>
            </View>
            {secondsLeft != null && (
              <Text variant="small" color={expired ? 'destructive' : 'mutedForeground'}>
                {expired
                  ? t('checkout.holdExpired')
                  : t('checkout.heldFor', {
                      minutes: Math.floor(secondsLeft / 60),
                      seconds: String(secondsLeft % 60).padStart(2, '0'),
                    })}
              </Text>
            )}
          </Card>

          {!!products.data?.length && (
            <Card style={{ gap: space(1) }}>
              <Text variant="h3" style={{ marginBottom: space(2) }}>
                {t('checkout.extrasTitle')}
              </Text>
              {products.data.map((p, index) => (
                <View key={p.code}>
                  {index > 0 && <Divider />}
                  <View style={{ paddingVertical: space(3) }}>
                    <ExtraRow
                      product={p}
                      qty={extras[p.code] ?? 0}
                      billableDays={billableDays}
                      onChange={(n) =>
                        setExtras((cur) => {
                          const next = { ...cur };
                          const clamped = Math.max(0, Math.min(p.maxQuantity, n));
                          if (clamped === 0) delete next[p.code];
                          else next[p.code] = clamped;
                          return next;
                        })
                      }
                    />
                  </View>
                </View>
              ))}
              {extrasEstimateMinor > 0 && (
                <Text variant="small" style={{ paddingTop: space(2), borderTopWidth: 1, borderTopColor: colors.border }}>
                  {t('checkout.extrasEstimate', { amount: formatMinor(extrasEstimateMinor, quote.data.currency, locale) })}
                </Text>
              )}
            </Card>
          )}

          <Card style={{ gap: space(4) }}>
            <Text variant="h3">{t('checkout.driverPayment')}</Text>
            <Field label={t('checkout.primaryDriverName')} required error={driverError ?? formErrors.fieldError('drivers.0.fullName')}>
              <Input value={fullName} onChangeText={setFullName} autoCapitalize="words" />
            </Field>
            <Field label={t('checkout.confirmationEmail')} error={formErrors.fieldError('drivers.0.email')}>
              <Input value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            </Field>
            <Field label={t('checkout.licenceNumber')} error={formErrors.fieldError('drivers.0.licenceNumber')}>
              <Input value={licence} onChangeText={setLicence} autoCapitalize="characters" />
            </Field>

            {mode.isLoading ? (
              <AppStateView kind="loading" inline title={t('checkout.stripeLoading')} />
            ) : !mode.data || mode.data.driver === 'simulator' ? (
              <View style={{ gap: space(3) }}>
                <Field label={t('checkout.paymentMethod')}>
                  <SegmentedControl
                    options={TEST_CARD_TOKENS.map((tok) => ({ value: tok, label: t(CARD_LABEL_KEY[tok]) }))}
                    value={card}
                    onChange={setCard}
                  />
                </Field>
                <TermsAndErrors accepted={accepted} setAccepted={setAccepted} formErrors={formErrors} />
                <Button
                  fullWidth
                  size="lg"
                  loading={confirm.isPending}
                  disabled={!accepted || expired}
                  onPress={() => {
                    if (!validateDriver()) return;
                    void doConfirm(card);
                  }}
                >
                  {payLabel}
                </Button>
              </View>
            ) : mode.data.publishableKey ? (
              <StripeGate publishableKey={mode.data.publishableKey}>
                <StripePaymentSection
                  onToken={doConfirm}
                  validate={validateDriver}
                  disabled={!accepted || expired}
                  loading={confirm.isPending}
                  payLabel={payLabel}
                  accepted={accepted}
                  setAccepted={setAccepted}
                  formErrors={formErrors}
                />
              </StripeGate>
            ) : (
              <AppStateView kind="failure" inline title={t('checkout.paymentUnavailable')} description={t('checkout.paymentUnavailableHint')} />
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

function TermsAndErrors({
  accepted,
  setAccepted,
  formErrors,
}: {
  accepted: boolean;
  setAccepted: (v: boolean) => void;
  formErrors: ReturnType<typeof useFormErrors>;
}) {
  const { t } = useI18n();
  const { colors, space } = useTheme();
  return (
    <View style={{ gap: space(2) }}>
      <Pressable onPress={() => setAccepted(!accepted)} style={{ flexDirection: 'row', gap: space(2), alignItems: 'flex-start' }}>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            borderWidth: 1.5,
            borderColor: accepted ? colors.primary : colors.border,
            backgroundColor: accepted ? colors.primary : 'transparent',
            marginTop: 1,
          }}
        />
        <Text variant="small" style={{ flex: 1 }}>
          {t('checkout.acceptTerms')}
        </Text>
      </Pressable>
      {formErrors.topLevelMessage ? (
        <Text variant="small" color="destructive">
          {formErrors.topLevelMessage}
        </Text>
      ) : null}
    </View>
  );
}

function ExtraRow({
  product,
  qty,
  billableDays,
  onChange,
}: {
  product: CatalogueProduct;
  qty: number;
  billableDays: number;
  onChange: (n: number) => void;
}) {
  const { t, locale } = useI18n();
  const { colors, space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(3) }}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <Text variant="bodyStrong">{product.name}</Text>
          {product.kind === 'protection' && <Badge tone="neutral">{t('checkout.extrasProtection')}</Badge>}
        </View>
        <Text variant="small" color="mutedForeground">
          {t(product.pricingUnit === 'per_day' ? 'checkout.extrasPerDay' : 'checkout.extrasOnce', {
            amount: formatMinor(product.unitPriceMinor, product.currency, locale),
          })}
          {product.pricingUnit === 'per_day' && billableDays > 1
            ? ` · ${t('checkout.extrasForDays', {
                amount: formatMinor(product.unitPriceMinor * billableDays, product.currency, locale),
                days: billableDays,
              })}`
            : ''}
        </Text>
      </View>
      {product.maxQuantity === 1 ? (
        <Pressable
          onPress={() => onChange(qty > 0 ? 0 : 1)}
          style={{
            paddingHorizontal: space(3),
            paddingVertical: space(2),
            borderRadius: 8,
            borderWidth: 1,
            borderColor: qty > 0 ? colors.primary : colors.border,
            backgroundColor: qty > 0 ? colors.primary : 'transparent',
          }}
        >
          <Text variant="small" style={{ color: qty > 0 ? colors.primaryForeground : colors.foreground }}>
            {t('checkout.extrasAdd')}
          </Text>
        </Pressable>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <Pressable
            onPress={() => onChange(qty - 1)}
            accessibilityLabel={t('checkout.extrasLess')}
            style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Minus size={16} color={colors.foreground} />
          </Pressable>
          <Text variant="body" style={{ width: 20, textAlign: 'center' }}>
            {qty}
          </Text>
          <Pressable
            onPress={() => onChange(qty + 1)}
            accessibilityLabel={t('checkout.extrasMore')}
            style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Plus size={16} color={colors.foreground} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

/**
 * Lives inside `<StripeGate>`'s `<StripeProvider>` — `useStripe` only resolves there. Same
 * deferred-PaymentMethod pattern as the web `StripePaymentForm`: `createPaymentMethod` hands back
 * a `pm_...` id without a client-side PaymentIntent; the backend creates *and* confirms it.
 */
function StripePaymentSection({
  onToken,
  validate,
  disabled,
  loading,
  payLabel,
  accepted,
  setAccepted,
  formErrors,
}: {
  onToken: (token: string) => Promise<void>;
  validate: () => boolean;
  disabled: boolean;
  loading: boolean;
  payLabel: string;
  accepted: boolean;
  setAccepted: (v: boolean) => void;
  formErrors: ReturnType<typeof useFormErrors>;
}) {
  const { t } = useI18n();
  const { colors, radius } = useTheme();
  const { createPaymentMethod } = useStripe();
  const [cardComplete, setCardComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);

  const submit = async () => {
    if (!validate()) return;
    if (!cardComplete) return;
    setStripeError(null);
    setSubmitting(true);
    try {
      const { paymentMethod, error } = await createPaymentMethod({ paymentMethodType: 'Card' });
      if (error || !paymentMethod) {
        setStripeError(error?.message ?? t('checkout.stripeError'));
        return;
      }
      await onToken(paymentMethod.id);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <Field label={t('checkout.cardDetails')}>
        <CardField
          postalCodeEnabled={false}
          style={{ height: 48, backgroundColor: colors.background }}
          cardStyle={{
            borderRadius: radius,
            borderWidth: 1,
            borderColor: toHexColor(colors.input),
            backgroundColor: toHexColor(colors.background),
            textColor: toHexColor(colors.foreground),
            placeholderColor: toHexColor(colors.mutedForeground),
          }}
          onCardChange={(details) => setCardComplete(details.complete)}
        />
      </Field>
      {stripeError ? (
        <Text variant="small" color="destructive">
          {stripeError}
        </Text>
      ) : null}
      <TermsAndErrors accepted={accepted} setAccepted={setAccepted} formErrors={formErrors} />
      <Button fullWidth size="lg" loading={loading || submitting} disabled={disabled || !cardComplete} onPress={submit}>
        {payLabel}
      </Button>
    </View>
  );
}
