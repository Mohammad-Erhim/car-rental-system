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
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ApiError } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import {
  formatMinor,
  useConfirmBooking,
  useQuoteByRef,
  type ReservationResult,
} from '../../lib/discovery-hooks.js';

const TEST_CARDS = [
  { token: 'tok_visa_ok', label: 'Visa •••• 4242 (approves)' },
  { token: 'tok_mastercard_ok', label: 'Mastercard •••• 4444 (approves)' },
  { token: 'tok_decline', label: 'Test card that is declined' },
];

/**
 * SCREEN-CUS-004/005/006/007 — Checkout. The held quote from discovery, driver + payer details,
 * a terms snapshot, and one payment that takes exactly one intended charge. On success the
 * confirmation (SCREEN-CUS-007) is shown with the reference and, for guests, an add-to-account CTA.
 */
export function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ref = params.get('quote');
  const { status } = useAuth();
  const quote = useQuoteByRef(ref);
  const confirm = useConfirmBooking();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [licence, setLicence] = useState('');
  const [card, setCard] = useState(TEST_CARDS[0]!.token);
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

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!fullName.trim()) {
      setLocalError('Enter the primary driver name.');
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
      });
      setResult(r);
    } catch (err) {
      setLocalError(
        err instanceof ApiError
          ? err.message
          : 'We could not complete the booking. Please try again.',
      );
    }
  }

  const lines = useMemo(() => quote.data?.lines ?? [], [quote.data]);

  if (result) {
    return <Confirmation result={result} authed={status === 'authenticated'} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Review &amp; checkout</h1>

      {!ref || quote.isError ? (
        <AppStateView
          kind="failure"
          title="That quote is no longer available"
          primaryAction={{ label: 'Start a new search', onClick: () => navigate('/') }}
        />
      ) : quote.isLoading || !quote.data ? (
        <AppStateView kind="loading" inline title="Loading your quote…" />
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
                        {formatMinor(l.amountMinor, quote.data!.currency)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-end" data-testid="quote-total">
                      {formatMinor(quote.data.totalMinor, quote.data.currency)}
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
                    ? 'Your hold has expired — search again for a fresh price.'
                    : `Held for ${Math.floor(secondsLeft / 60)}m ${String(secondsLeft % 60).padStart(2, '0')}s`}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Driver &amp; payment</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={pay} className="space-y-4" noValidate>
                <Field label="Primary driver name" htmlFor="co-name" required>
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
                  <Field label="Email for the confirmation" htmlFor="co-email">
                    {({ id }) => (
                      <Input
                        id={id}
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Driving licence number" htmlFor="co-licence">
                    {({ id }) => (
                      <Input id={id} value={licence} onChange={(e) => setLicence(e.target.value)} />
                    )}
                  </Field>
                </div>
                <Field label="Payment method (test cards)" htmlFor="co-card">
                  {({ id }) => (
                    <select
                      id={id}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={card}
                      onChange={(e) => setCard(e.target.value)}
                      data-testid="co-card"
                    >
                      {TEST_CARDS.map((c) => (
                        <option key={c.token} value={c.token}>
                          {c.label}
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
                  <span>
                    I accept the rental terms &amp; conditions (v1.0). The exact version and time
                    are recorded with the booking.
                  </span>
                </label>
                {localError ? (
                  <p className="text-sm text-destructive" data-testid="co-error">
                    {localError}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  loading={confirm.isPending}
                  disabled={!accepted || expired}
                  data-testid="co-pay"
                >
                  Pay {formatMinor(quote.data.totalMinor, quote.data.currency)} &amp; confirm
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Confirmation({ result, authed }: { result: ReservationResult; authed: boolean }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Booking confirmed
            <Badge variant="success" data-testid="confirm-state">
              {result.state}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Reference{' '}
            <span className="bidi-isolate font-mono font-semibold" data-testid="confirm-ref">
              {result.reference}
            </span>
          </p>
          <table className="w-full text-sm" data-testid="confirm-lines">
            <tbody>
              {result.lines.map((l) => (
                <tr key={l.code} className="border-b last:border-0">
                  <td className="py-1.5">{l.label}</td>
                  <td className="py-1.5 text-end">{formatMinor(l.amountMinor, result.currency)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2">
                  Charged to {result.payment.brand ?? 'card'} •••• {result.payment.last4 ?? '••••'}
                </td>
                <td className="py-2 text-end" data-testid="confirm-total">
                  {formatMinor(result.totalMinor, result.currency)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            Terms v{result.termsAccepted?.version} accepted{' '}
            {result.termsAccepted ? new Date(result.termsAccepted.acceptedAt).toLocaleString() : ''}
            . A confirmation email has been sent.
          </p>
          {!authed && result.guestAccessToken ? (
            <AppStateView
              kind="empty"
              inline
              title="Booked as a guest"
              description="Create an account with this email to see and manage this booking any time."
            />
          ) : (
            <Button asChild variant="outline">
              <Link to="/trips">View my trips</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
