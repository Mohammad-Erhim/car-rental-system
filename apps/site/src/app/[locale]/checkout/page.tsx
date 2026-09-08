'use client';

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
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';

import { ApiError } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';
import {
  formatMinor,
  useAvailableProducts,
  useConfirmBooking,
  useQuoteByRef,
  type ReservationResult,
} from '../../../lib/customer-hooks';
import { useLocale } from '../../../lib/nav';

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
  const extrasEstimateMinor = useMemo(() => {
    const byCode = new Map((products.data ?? []).map((p) => [p.code, p.unitPriceMinor]));
    return Object.entries(extras).reduce(
      (sum, [code, qty]) => sum + (byCode.get(code) ?? 0) * qty,
      0,
    );
  }, [extras, products.data]);

  async function pay(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!fullName.trim()) {
      setLocalError(t('checkout.enterDriverName'));
      return;
    }
    if (!accepted) return;
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
        paymentToken: card,
        extraCodes: extraCodes.length ? extraCodes : undefined,
      });
      setResult(r);
    } catch (err) {
      setLocalError(err instanceof ApiError ? err.message : t('checkout.genericError'));
    }
  }

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
                          {t('checkout.extrasPerDay', {
                            amount: formatMinor(p.unitPriceMinor, p.currency, uiLocale),
                          })}
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
            <CardContent>
              <form onSubmit={pay} className="space-y-4" noValidate>
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
                <Field label={t('checkout.paymentMethod')} htmlFor="co-card">
                  {({ id }) => (
                    <select
                      id={id}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={card}
                      onChange={(e) => setCard(e.target.value as CardToken)}
                      data-testid="co-card"
                    >
                      {TEST_CARD_TOKENS.map((tok) => (
                        <option key={tok} value={tok}>
                          {t(CARD_LABEL_KEY[tok])}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
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
                {extrasEstimateMinor > 0 ? (
                  <p className="text-xs text-muted-foreground" data-testid="co-extras-note">
                    {t('checkout.extrasChargeNote', {
                      amount: formatMinor(
                        quote.data.totalMinor + extrasEstimateMinor,
                        quote.data.currency,
                        uiLocale,
                      ),
                    })}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  loading={confirm.isPending}
                  disabled={!accepted || expired}
                  data-testid="co-pay"
                >
                  {t('checkout.payConfirm', {
                    amount: formatMinor(
                      quote.data.totalMinor + extrasEstimateMinor,
                      quote.data.currency,
                      uiLocale,
                    ),
                  })}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
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
