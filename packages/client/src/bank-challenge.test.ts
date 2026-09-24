import { ERROR_CODE, type Problem } from '@carrental/contracts';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from './api-error';
import { BankChallengeFailedError, submitWithBankChallenge } from './bank-challenge';

const problem = (over: Partial<Problem>): Problem => ({
  code: 'internal_error',
  category: 'internal',
  status: 500,
  title: 'x',
  correlationId: 'c-1',
  ...over,
});
const challenge = (secret: string | null = 'pi_secret_1') =>
  new ApiError(
    problem({
      code: ERROR_CODE.PAYMENT_ACTION_REQUIRED,
      category: 'business_rule',
      status: 402,
      params: secret === null ? undefined : { clientSecret: secret },
    }),
  );

describe('submitWithBankChallenge', () => {
  it('returns a plain success without ever involving the bank', async () => {
    const submit = vi.fn().mockResolvedValue({ reference: 'RES-1' });
    const authenticate = vi.fn();
    await expect(submitWithBankChallenge(submit, authenticate)).resolves.toEqual({
      reference: 'RES-1',
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('hands the client secret to the processor, then submits the SAME request again', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(challenge('pi_secret_abc'))
      .mockResolvedValueOnce({ reference: 'RES-2' });
    const authenticate = vi.fn().mockResolvedValue(null);
    await expect(submitWithBankChallenge(submit, authenticate)).resolves.toEqual({
      reference: 'RES-2',
    });
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(authenticate).toHaveBeenCalledWith('pi_secret_abc');
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('an authenticate that resolves to nothing at all counts as success, not as a failed challenge', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(challenge())
      .mockResolvedValueOnce({ reference: 'RES-3' });
    await expect(submitWithBankChallenge(submit, async () => undefined)).resolves.toEqual({
      reference: 'RES-3',
    });
  });

  it("a challenge the customer fails ends the checkout with the processor's message — no second submit", async () => {
    const submit = vi.fn().mockRejectedValue(challenge());
    const authenticate = vi
      .fn()
      .mockResolvedValue('We are unable to authenticate your payment method.');
    const err: unknown = await submitWithBankChallenge(submit, authenticate).catch((e) => e);
    expect(err).toBeInstanceOf(BankChallengeFailedError);
    expect((err as Error).message).toBe('We are unable to authenticate your payment method.');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('a bank that asks again is answered again, but not forever', async () => {
    const submit = vi.fn().mockRejectedValue(challenge());
    const authenticate = vi.fn().mockResolvedValue(null);
    const err: unknown = await submitWithBankChallenge(submit, authenticate).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(ERROR_CODE.PAYMENT_ACTION_REQUIRED);
    expect(submit).toHaveBeenCalledTimes(3);
    expect(authenticate).toHaveBeenCalledTimes(2);
  });

  it('rethrows every other API error untouched (a decline stays a decline)', async () => {
    const declined = new ApiError(
      problem({
        code: 'business_rule_violation',
        category: 'business_rule',
        status: 422,
        title: 'The payment was declined',
      }),
    );
    const authenticate = vi.fn();
    await expect(
      submitWithBankChallenge(() => Promise.reject(declined), authenticate),
    ).rejects.toBe(declined);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('rethrows non-API errors untouched', async () => {
    const boom = new Error('network');
    await expect(submitWithBankChallenge(() => Promise.reject(boom), vi.fn())).rejects.toBe(boom);
  });

  it('a challenge with no client secret cannot be run — it is surfaced as the error it is', async () => {
    const noSecret = challenge(null);
    const authenticate = vi.fn();
    await expect(
      submitWithBankChallenge(() => Promise.reject(noSecret), authenticate),
    ).rejects.toBe(noSecret);
    expect(authenticate).not.toHaveBeenCalled();
  });
});
