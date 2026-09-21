import { ERROR_CODE } from '@carrental/contracts';

import { ApiError } from './api-error';

/**
 * Checkout's 3-D Secure round trip (DEC-040). When a card's bank wants the customer to authenticate,
 * the API answers the payment step with `payment_action_required` and the processor's client secret
 * — nothing charged, nothing booked, the hold still live. The client hands that secret to the
 * processor's SDK (`stripe.handleNextAction` on the web, the native SDK's equivalent in the app),
 * the customer completes the bank's challenge, and the SAME request is submitted again: the server
 * finds the authenticated payment and captures it.
 *
 * No DOM here, so the web checkout and the mobile app share one implementation — each passes its
 * own SDK call as `authenticate`.
 */

/** The customer did not complete the bank's challenge; `message` is the processor's own wording. */
export class BankChallengeFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BankChallengeFailedError';
  }
}

/** A bank can ask again (a customer submitting before they finished); this bounds the loop. */
const MAX_ROUNDS = 3;

/**
 * Run `submit` (the checkout request); if it is answered `payment_action_required`, run
 * `authenticate` with the client secret — it resolves to nothing (`null`) once the customer has
 * authenticated, or to the processor's error message if they did not — and submit again.
 *
 * Every other outcome is untouched: a success returns its value, any other error is rethrown as it
 * came, so callers keep their existing error handling. A failed challenge throws
 * {@link BankChallengeFailedError}.
 */
export async function submitWithBankChallenge<T>(
  submit: () => Promise<T>,
  authenticate: (clientSecret: string) => Promise<string | null | undefined>,
): Promise<T> {
  for (let round = 1; ; round++) {
    try {
      return await submit();
    } catch (err) {
      const secret =
        err instanceof ApiError && err.code === ERROR_CODE.PAYMENT_ACTION_REQUIRED
          ? err.problem.params?.clientSecret
          : undefined;
      if (typeof secret !== 'string' || !secret || round >= MAX_ROUNDS) throw err;
      const failure = await authenticate(secret);
      // nothing back (null / undefined) means the customer authenticated; any text is why they did not
      if (failure != null) throw new BankChallengeFailedError(failure);
    }
  }
}
