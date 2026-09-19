import { describe, expect, it } from 'vitest';

import { CRON_PRESETS, parseRecipients, recipientsValid } from './report-model';

describe('report-model', () => {
  it('splits recipients on commas, semicolons and whitespace', () => {
    expect(parseRecipients('a@x.com, b@y.com;c@z.com  d@w.com')).toEqual([
      'a@x.com',
      'b@y.com',
      'c@z.com',
      'd@w.com',
    ]);
    expect(parseRecipients('  ')).toEqual([]);
  });

  it('needs at least one address and every one valid', () => {
    expect(recipientsValid([])).toBe(false);
    expect(recipientsValid(['a@x.com'])).toBe(true);
    expect(recipientsValid(['a@x.com', 'nope'])).toBe(false);
  });

  it('offers weekly, daily and monthly presets', () => {
    expect(CRON_PRESETS.map((p) => p.value)).toEqual(['0 7 * * 1', '0 7 * * *', '0 7 1 * *']);
  });
});
