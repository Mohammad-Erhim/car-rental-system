import { AppStateView, Card, CardContent, CardHeader, CardTitle } from '@carrental/ui';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { formatMinor, useQuoteByRef } from '../../lib/discovery-hooks.js';

/**
 * SCREEN-CUS-004 lands in STAGE-003. For now this shows the real, held quote with a live hold
 * countdown so the discovery → checkout hand-off is verifiable end to end.
 */
export function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ref = params.get('quote');
  const quote = useQuoteByRef(ref);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    const iso = quote.data?.hold?.expiresAt ?? quote.data?.expiresAt;
    if (!iso) return;
    const target = new Date(iso).getTime();
    const tick = () => setSecondsLeft(Math.round((target - Date.now()) / 1000));
    tick();
    const iv = window.setInterval(tick, 1000);
    return () => window.clearInterval(iv);
  }, [quote.data]);

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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {quote.data.categoryCode} · {quote.data.pickupLocationCode} →{' '}
              {quote.data.returnLocationCode}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <table className="w-full text-sm" data-testid="quote-lines">
              <tbody>
                {quote.data.lines.map((l) => (
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
                className={`text-sm ${secondsLeft <= 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                data-testid="hold-timer"
              >
                {secondsLeft > 0
                  ? `Held for ${Math.floor(secondsLeft / 60)}m ${String(secondsLeft % 60).padStart(2, '0')}s`
                  : 'Your hold has expired — search again for a fresh price.'}
              </p>
            ) : null}
            <AppStateView
              kind="empty"
              inline
              title="Payment, drivers and terms are delivered in the next stage"
              description="The quote and hold above are real and enforced by the API."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
