import { describe, expect, it } from 'vitest';

import {
  ERROR_CODE,
  ERROR_CODE_CATEGORY,
  ERROR_CODE_HTTP_STATUS,
  zMoney,
  zProblem,
  zLocalesResponse,
} from './index';

describe('contracts', () => {
  it('every error code has a category and an http status', () => {
    for (const code of Object.values(ERROR_CODE)) {
      expect(ERROR_CODE_CATEGORY[code], `category for ${code}`).toBeDefined();
      expect(ERROR_CODE_HTTP_STATUS[code], `status for ${code}`).toBeGreaterThanOrEqual(400);
    }
  });

  it('money schema rejects floats and normalizes currency', () => {
    expect(zMoney.safeParse({ amountMinor: 12.5, currency: 'usd' }).success).toBe(false);
    const parsed = zMoney.parse({ amountMinor: 1299, currency: 'usd' });
    expect(parsed.currency).toBe('USD');
  });

  it('problem envelope requires code, category, status, correlationId', () => {
    const ok = zProblem.safeParse({
      code: 'version_conflict',
      category: 'conflict',
      status: 409,
      title: 'Version conflict',
      correlationId: 'abc-123',
      currentVersion: 4,
    });
    expect(ok.success).toBe(true);
    expect(zProblem.safeParse({ code: 'x' }).success).toBe(false);
  });

  it('locales response shape', () => {
    const ok = zLocalesResponse.safeParse({
      defaultLocale: 'en',
      locales: [
        {
          code: 'en',
          nativeName: 'English',
          englishName: 'English',
          direction: 'ltr',
          isDefault: true,
          fallback: [],
          testOnly: true,
        },
      ],
    });
    expect(ok.success).toBe(true);
  });
});
