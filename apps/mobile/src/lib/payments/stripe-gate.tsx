import { StripeProvider } from '@stripe/stripe-react-native';
import type { ReactElement } from 'react';

/**
 * Thin wrapper around `<StripeProvider>` — mirrors `apps/site`'s `getStripePromise` (one SDK
 * init, scoped to checkout, keyed off the org's live publishable key from `/ops/payments/mode`)
 * without owning the payment-mode fetch itself; the checkout screen already needs that query for
 * its own branching (simulator vs. real card UI), so this only wraps the Stripe-specific subtree.
 * `children` is a single element (not `ReactNode`) — `StripeProvider`'s own types require it.
 */
export function StripeGate({ publishableKey, children }: { publishableKey: string; children: ReactElement }) {
  return (
    <StripeProvider publishableKey={publishableKey} merchantIdentifier="merchant.com.carrental.app" urlScheme="carrental">
      {children}
    </StripeProvider>
  );
}
