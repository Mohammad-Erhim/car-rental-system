'use client';

import { ApiError } from '@carrental/client';
import { useAuth } from '@carrental/client/react';
import { useI18n } from '@carrental/i18n/react';
import {
  AppStateView,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  Input,
} from '@carrental/ui';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe, type StripeElementLocale } from '@stripe/stripe-js';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import {
  formatMinor,
  useAvailableProducts,
  useConfirmBooking,
  usePaymentMode,
  useQuoteByRef,
  type ReservationResult,
} from '../../../lib/customer-hooks';
import { useLocale } from '../../../lib/nav';

// One `loadStripe()` call per publishable key for the lifetime of the tab — `loadStripe` injects
// a <script> and is not meant to be called on every render; a dashboard-driven key change (test
// <-> live) is rare enough that a simple last-key cache (not a full LRU) is the right amount of
// machinery here.
let stripePromiseCache: { key: string; promise: Promise<Stripe | null> } | null = null;
function getStripePromise(publishableKey: string): Promise<Stripe | null> {
  if (stripePromiseCache?.key !== publishableKey) {
    stripePromiseCache = { key: publishableKey, promise: loadStripe(publishableKey) };
  }
  return stripePromiseCache.promise;
}

const TEST_CARD_TOKENS = ['tok_visa_ok', 'tok_mastercard_ok', 'tok_decline'] as const;
type CardToken = (typeof TEST_CARD_TOKENS)[number];
const CARD_LABEL_KEY: Record<CardToken, string> = {
  tok_visa_ok: 'checkout.card.visa',
  tok_mastercard_ok: 'checkout.card.mastercard',
  tok_decline: 'checkout.card.decline',
};

/** SCREEN-CUS-004..007 — checkout: held quote, driver + payer, terms snapshot, one charge. */
function CheckoutInner() {
  const { t, locale: uiLocale } = useI18n();
  const locale = useLocale();
  const params = useSearchParams();
  const router = useRouter();
  const ref = params.get('quote');
  const { status } = useAuth();
  const quote = useQuoteByRef(ref);
  const confirm = useConfirmBooking();
  const mode = usePaymentMode();
  const products = useAvailableProducts(
    quote.data?.categoryCode ?? null,
    quote.data?.pickupLocationCode ?? null,
  );

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [licence, setLicence] = useState('');
  const [card, setCard] = useState<CardToken>(TEST_CARD_TOKENS[0]);
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [accepted, setAccepted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [result, setResult] = useState<ReservationResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const iso = quote.data?.hold?.expiresAt ?? quote.data?.expiresAt;
    if (!iso) return;
    const target = new Date(iso).getTime();
    const tick = () => setSecondsLeft(Math.round((target - Date.now()) / 1000));
    tick();
    const iv = window.setInterval(tick, 1000);
    return () => window.clearInterval(iv);
  }, [quote.data]);

  const expired = secondsLeft != null && secondsLeft <= 0;
  const lines = useMemo(() => quote.data?.lines ?? [], [quote.data]);

  // Client-side estimate only — the server re-prices `extraCodes` authoritatively on confirm.
  const extraCodes = useMemo(
    () => Object.entries(extras).flatMap(([code, qty]) => Array.from({ length: qty }, () => code)),
    [extras],
  );
  // a per-day product costs (unit price × billable days); mirrors ProductService.resolveForBooking
  const billableDays = Math.max(1, Math.ceil((quote.data?.durationHours ?? 24) / 24));
  const extrasEstimateMinor = useMemo(() => {
    const byCode = new Map(
      (products.data ?? []).map((p) => [
        p.code,
        p.unitPriceMinor * (p.pricingUnit === 'per_day' ? billableDays : 1),
      ]),
    );
    return Object.entries(extras).reduce(
      (sum, [code, qty]) => sum + (byCode.get(code) ?? 0) * qty,
      0,
    );
  }, [extras, products.data, billableDays]);

  // Shared by both payment branches: the primary-driver name and terms acceptance are required
  // regardless of which provider actually takes the card (SCREEN-CUS-006/007).
  function validateDriver(): boolean {
    setLocalError(null);
    if (!fullName.trim()) {
      setLocalError(t('checkout.enterDriverName'));
      return false;
    }
    if (!accepted) return false;
    return true;
  }

  // The one call that actually books & charges, regardless of where `token` came from — the
  // simulator's fixed test tokens, or a real Stripe PaymentMethod id created client-side by
  // `StripePaymentForm` below. Card data itself never reaches our servers either way.
  async function doConfirm(token: string) {
    setLocalError(null);
    try {
      const r = await confirm.mutateAsync({
        quoteReference: ref!,
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
      });
      setResult(r);
    } catch (err) {
      setLocalError(err instanceof ApiError ? err.message : t('checkout.genericError'));
    }
  }

  async function paySimulator(e: FormEvent) {
    e.preventDefault();
    if (!validateDriver()) return;
    await doConfirm(card);
  }

  const totalWithExtrasMinor = (quote.data?.totalMinor ?? 0) + extrasEstimateMinor;
  const payLabel = quote.data
    ? t('checkout.payConfirm', {
        amount: formatMinor(totalWithExtrasMinor, quote.data.currency, uiLocale),
      })
    : '';
  const termsAndErrors = (
    <>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          data-testid="co-terms"
        />
        <span>{t('checkout.acceptTerms')}</span>
      </label>
      {localError ? (
        <p className="text-sm text-destructive" data-testid="co-error">
          {localError}
        </p>
      ) : null}
      {quote.data && extrasEstimateMinor > 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="co-extras-note">
          {t('checkout.extrasChargeNote', {
            amount: formatMinor(totalWithExtrasMinor, quote.data.currency, uiLocale),
          })}
        </p>
      ) : null}
    </>
  );

  if (result) {
    return <Confirmation result={result} authed={status === 'authenticated'} locale={locale} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">{t('checkout.title')}</h1>

      {!ref || quote.isError ? (
        <AppStateView
          kind="failure"
          title={t('checkout.quoteGone')}
          primaryAction={{
            label: t('checkout.startNewSearch'),
            onClick: () => router.push(`/${locale}/search`),
          }}
        />
      ) : quote.isLoading || !quote.data ? (
        <AppStateView kind="loading" inline title={t('checkout.loadingQuote')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {quote.data.categoryCode} · {quote.data.pickupLocationCode} →{' '}
                {quote.data.returnLocationCode}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <table className="w-full text-sm" data-testid="quote-lines">
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.code} className="border-b last:border-0">
                      <td className="py-1.5">{l.label}</td>
                      <td className="py-1.5 text-end">
                        {formatMinor(l.amountMinor, quote.data!.currency, uiLocale)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2">{t('checkout.total')}</td>
                    <td className="py-2 text-end" data-testid="quote-total">
                      {formatMinor(quote.data.totalMinor, quote.data.currency, uiLocale)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {secondsLeft != null ? (
                <p
                  className={`text-sm ${expired ? 'text-destructive' : 'text-muted-foreground'}`}
                  data-testid="hold-timer"
                >
                  {expired
                    ? t('checkout.holdExpired')
                    : t('checkout.heldFor', {
                        minutes: Math.floor(secondsLeft / 60),
                        seconds: String(secondsLeft % 60).padStart(2, '0'),
                      })}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {products.data && products.data.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('checkout.extrasTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3" data-testid="checkout-extras">
                {products.data.map((p) => {
                  const qty = extras[p.code] ?? 0;
                  const setQty = (n: number) =>
                    setExtras((cur) => {
                      const next = { ...cur };
                      const clamped = Math.max(0, Math.min(p.maxQuantity, n));
                      if (clamped === 0) delete next[p.code];
                      else next[p.code] = clamped;
                      return next;
                    });
                  return (
                    <div
                      key={p.code}
                      className="flex flex-wrap items-center justify-between gap-3"
                      data-testid={`extra-${p.code}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {p.name}{' '}
                          {p.kind === 'protection' ? (
                            <Badge variant="neutral">{t('checkout.extrasProtection')}</Badge>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t(
                            p.pricingUnit === 'per_day'
                              ? 'checkout.extrasPerDay'
                              : 'checkout.extrasOnce',
                            { amount: formatMinor(p.unitPriceMinor, p.currency, uiLocale) },
                          )}
                          {p.pricingUnit === 'per_day' && billableDays > 1
                            ? ` · ${t('checkout.extrasForDays', {
                                amount: formatMinor(
                                  p.unitPriceMinor * billableDays,
                                  p.currency,
                                  uiLocale,
                                ),
                                days: billableDays,
                              })}`
                            : ''}
                        </p>
                      </div>
                      {p.maxQuantity === 1 ? (
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={qty > 0}
                            onChange={(e) => setQty(e.target.checked ? 1 : 0)}
                            data-testid={`extra-toggle-${p.code}`}
                          />
                          {t('checkout.extrasAdd')}
                        </label>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={t('checkout.extrasLess')}
                            onClick={() => setQty(qty - 1)}
                          >
                            −
                          </Button>
                          <span
                            className="w-6 text-center text-sm tabular-nums"
                            data-testid={`extra-qty-${p.code}`}
                          >
                            {qty}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={t('checkout.extrasMore')}
                            onClick={() => setQty(qty + 1)}
                          >
                            +
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {extrasEstimateMinor > 0 ? (
                  <p className="border-t pt-2 text-sm" data-testid="extras-estimate">
                    {t('checkout.extrasEstimate', {
                      amount: formatMinor(extrasEstimateMinor, quote.data.currency, uiLocale),
                    })}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('checkout.driverPayment')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label={t('checkout.primaryDriverName')} htmlFor="co-name" required>
                {({ id }) => (
                  <Input
                    id={id}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('checkout.confirmationEmail')} htmlFor="co-email">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t('checkout.licenceNumber')} htmlFor="co-licence">
                  {({ id }) => (
                    <Input id={id} value={licence} onChange={(e) => setLicence(e.target.value)} />
                  )}
                </Field>
              </div>

              {mode.isLoading ? (
                <AppStateView kind="loading" inline title={t('checkout.stripeLoading')} />
              ) : !mode.data || mode.data.driver === 'simulator' ? (
                <form onSubmit={paySimulator} className="space-y-4" noValidate>
                  <Field label={t('checkout.paymentMethod')} htmlFor="co-card">
                    {({ id }) => (
                      <select
                        id={id}
                        className="flex h-11 w-full rounded-md border border-hairline bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        value={card}
                        onChange={(e) => setCard(e.target.value as CardToken)}
                        data-testid="co-card"
                      >
                        {TEST_CARD_TOKENS.map((tok) => (
                          <option key={tok} value={tok} className="bg-surface text-ink">
                            {t(CARD_LABEL_KEY[tok])}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  {termsAndErrors}
                  <Button
                    type="submit"
                    loading={confirm.isPending}
                    disabled={!accepted || expired}
                    data-testid="co-pay"
                  >
                    {payLabel}
                  </Button>
                </form>
              ) : mode.data.publishableKey ? (
                <Elements
                  key={mode.data.publishableKey}
                  stripe={getStripePromise(mode.data.publishableKey)}
                  options={{
                    mode: 'payment',
                    amount: Math.max(1, totalWithExtrasMinor),
                    currency: quote.data.currency.toLowerCase(),
                    locale: uiLocale as StripeElementLocale,
                  }}
                >
                  <StripePaymentForm
                    onToken={doConfirm}
                    validate={validateDriver}
                    disabled={!accepted || expired}
                    loading={confirm.isPending}
                    payLabel={payLabel}
                    extra={termsAndErrors}
                  />
                </Elements>
              ) : (
                <AppStateView
                  kind="failure"
                  inline
                  title={t('checkout.paymentUnavailable')}
                  description={t('checkout.paymentUnavailableHint')}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * Lives inside `<Elements>` — `useStripe`/`useElements` only resolve there. Uses the "deferred"
 * Payment Element pattern (no `clientSecret` passed to `<Elements>`): `stripe.createPaymentMethod`
 * hands back a `pm_...` id without our ever creating a PaymentIntent client-side, matching this
 * system's existing single-request confirm flow — the backend creates *and* confirms the
 * PaymentIntent itself (see `StripePaymentAdapter.authorize`).
 */
function StripePaymentForm({
  onToken,
  validate,
  disabled,
  loading,
  payLabel,
  extra,
}: {
  onToken: (token: string) => Promise<void>;
  validate: () => boolean;
  disabled: boolean;
  loading: boolean;
  payLabel: string;
  extra: ReactNode;
}) {
  const { t } = useI18n();
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!stripe || !elements) return;
    setStripeError(null);
    setSubmitting(true);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setStripeError(submitError.message ?? t('checkout.stripeError'));
        return;
      }
      const { error, paymentMethod } = await stripe.createPaymentMethod({ elements });
      if (error || !paymentMethod) {
        setStripeError(error?.message ?? t('checkout.stripeError'));
        return;
      }
      await onToken(paymentMethod.id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field label={t('checkout.cardDetails')} htmlFor="co-stripe-card">
        {() => <PaymentElement id="co-stripe-card" />}
      </Field>
      {stripeError ? (
        <p className="text-sm text-destructive" data-testid="co-stripe-error">
          {stripeError}
        </p>
      ) : null}
      {extra}
      <Button
        type="submit"
        loading={loading || submitting}
        disabled={disabled || !stripe || !elements}
        data-testid="co-pay"
      >
        {payLabel}
      </Button>
    </form>
  );
}

function Confirmation({
  result,
  authed,
  locale,
}: {
  result: ReservationResult;
  authed: boolean;
  locale: string;
}) {
  const { t, locale: uiLocale } = useI18n();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {t('checkout.confirmedTitle')}
            <Badge variant="success" data-testid="confirm-state">
              {t(`reservation.state.${result.state}`)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            {t('checkout.referenceLabel')}{' '}
            <span className="bidi-isolate font-mono font-semibold" data-testid="confirm-ref">
              {result.reference}
            </span>
          </p>
          {result.pickedUnit ? (
            <p className="text-sm" data-testid="confirm-picked-unit">
              {t('checkout.yourCar', {
                car: [
                  [result.pickedUnit.make, result.pickedUnit.model].filter(Boolean).join(' '),
                  result.pickedUnit.colour ? `(${result.pickedUnit.colour})` : null,
                ]
                  .filter(Boolean)
                  .join(' '),
              })}
            </p>
          ) : null}
          <table className="w-full text-sm" data-testid="confirm-lines">
            <tbody>
              {result.lines.map((l) => (
                <tr key={l.code} className="border-b last:border-0">
                  <td className="py-1.5">{l.label}</td>
                  <td className="py-1.5 text-end">
                    {formatMinor(l.amountMinor, result.currency, uiLocale)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2">
                  {t('checkout.chargedTo', {
                    brand: result.payment.brand ?? 'card',
                    last4: result.payment.last4 ?? '••••',
                  })}
                </td>
                <td className="py-2 text-end" data-testid="confirm-total">
                  {formatMinor(result.totalMinor, result.currency, uiLocale)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            {t('checkout.termsAcceptedAt', {
              version: result.termsAccepted?.version ?? '1.0',
              datetime: result.termsAccepted
                ? new Date(result.termsAccepted.acceptedAt).toLocaleString(uiLocale)
                : '',
            })}
          </p>
          {!authed && result.guestAccessToken ? (
            <AppStateView
              kind="empty"
              inline
              title={t('checkout.bookedAsGuest')}
              description={t('checkout.bookedAsGuestHint')}
            />
          ) : (
            <Button asChild variant="outline">
              <Link href={`/${locale}/trips`}>{t('checkout.viewMyTrips')}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}
