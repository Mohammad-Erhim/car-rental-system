import { describe, expect, it } from 'vitest';

import {
  ERROR_CODE,
  ERROR_CODE_CATEGORY,
  ERROR_CODE_HTTP_STATUS,
  zMoney,
  zProblem,
  zLocalesResponse,
  zConfirmBookingRequest,
  zConfirmBookingRequestDebug,
  zDriverInput,
  zCtaLink,
  zSafeHref,
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

  it('zSafeHref allow-lists relative/anchor/https and rejects dangerous schemes', () => {
    expect(zSafeHref.safeParse('/vehicles/economy').success).toBe(true);
    expect(zSafeHref.safeParse('#pricing').success).toBe(true);
    expect(zSafeHref.safeParse('https://example.com/x').success).toBe(true);
    expect(zSafeHref.safeParse('javascript:alert(1)').success).toBe(false);
    expect(zSafeHref.safeParse('data:text/html,<script>1</script>').success).toBe(false);
    expect(zSafeHref.safeParse('//evil.example.com').success).toBe(false); // protocol-relative
    expect(zSafeHref.safeParse('http://example.com').success).toBe(false); // not https
  });

  it('zCtaLink.href is validated by the same allow-list', () => {
    expect(zCtaLink.safeParse({ label: { en: 'Book now' }, href: '/book' }).success).toBe(true);
    expect(zCtaLink.safeParse({ label: { en: 'x' }, href: 'javascript:alert(1)' }).success).toBe(
      false,
    );
  });

  it('licenceCountry must be exactly 2 chars and normalizes to upper case', () => {
    const ok = zDriverInput.safeParse({ fullName: 'A B', licenceCountry: 'fr' });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.licenceCountry).toBe('FR');
    expect(zDriverInput.safeParse({ fullName: 'A B', licenceCountry: '' }).success).toBe(false);
    expect(zDriverInput.safeParse({ fullName: 'A B', licenceCountry: 'FRA' }).success).toBe(false);
  });

  it('zConfirmBookingRequest (the public contract) has no debug fault-injection field', () => {
    expect(zConfirmBookingRequest.shape).not.toHaveProperty('simulateWriteFailure');
    expect(zConfirmBookingRequestDebug.shape).toHaveProperty('simulateWriteFailure');
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
