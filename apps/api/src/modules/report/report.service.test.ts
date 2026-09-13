import { describe, expect, it } from 'vitest';

import {
  csvCell,
  isScheduleDue,
  nextFireAfter,
  runDataQualityCheck,
  sampleHash,
  utilizationPercent,
} from './report.service';

describe('nextFireAfter', () => {
  it('returns the next occurrence strictly after the baseline, not the baseline itself', () => {
    // "every Monday at 07:00 UTC" — 2026-01-12 is a Monday
    const next = nextFireAfter('0 7 * * 1', new Date('2026-01-12T07:00:00.000Z'));
    expect(next?.toISOString()).toBe('2026-01-19T07:00:00.000Z');
  });

  it('null for a malformed expression — never fires, does not throw', () => {
    expect(nextFireAfter('not a cron', new Date())).toBeNull();
    expect(nextFireAfter('99 99 * * *', new Date())).toBeNull();
  });

  it('accepts a string baseline the same as a Date', () => {
    const a = nextFireAfter('0 7 * * 1', '2026-01-12T00:00:00.000Z');
    const b = nextFireAfter('0 7 * * 1', new Date('2026-01-12T00:00:00.000Z'));
    expect(a?.toISOString()).toBe(b?.toISOString());
  });
});

describe('isScheduleDue', () => {
  const monday7am = '0 7 * * 1'; // weekly preset

  it('not due yet when the next occurrence is still in the future', () => {
    const lastRun = new Date('2026-01-12T07:00:00.000Z'); // Monday 07:00
    const now = new Date('2026-01-15T00:00:00.000Z'); // Thursday, same week
    expect(isScheduleDue(monday7am, lastRun, now)).toBe(false);
  });

  it('due once "now" reaches the next occurrence', () => {
    const lastRun = new Date('2026-01-12T07:00:00.000Z');
    const now = new Date('2026-01-19T07:00:00.000Z'); // exactly the next Monday 07:00
    expect(isScheduleDue(monday7am, lastRun, now)).toBe(true);
  });

  it('still due if the tick was missed and now is well past the occurrence', () => {
    const lastRun = new Date('2026-01-12T07:00:00.000Z');
    const now = new Date('2026-01-25T00:00:00.000Z'); // two weeks later
    expect(isScheduleDue(monday7am, lastRun, now)).toBe(true);
  });

  it('a never-run schedule uses its creation time as the baseline, not "always due"', () => {
    // created mid-week, after that week's Monday — next occurrence is the *following* Monday
    const createdAt = new Date('2026-01-14T12:00:00.000Z'); // Wednesday
    expect(isScheduleDue(monday7am, createdAt, new Date('2026-01-16T00:00:00.000Z'))).toBe(false);
    expect(isScheduleDue(monday7am, createdAt, new Date('2026-01-19T07:00:00.000Z'))).toBe(true);
  });

  it('a malformed cron is never due', () => {
    expect(isScheduleDue('garbage', new Date('2020-01-01'), new Date())).toBe(false);
  });
});

describe('runDataQualityCheck — one check failing must never look like "clear"', () => {
  const meta = { id: 'test_check', title: 'A test check', severity: 'medium' as const };

  it('reports a clean result when the query finds nothing', async () => {
    const result = await runDataQualityCheck(meta, async () => ({ count: 0, sample: [] }));
    expect(result).toEqual({ ...meta, count: 0, ok: true, sample: [], error: null });
  });

  it('reports a real finding as not-ok, distinct from a failure', async () => {
    const result = await runDataQualityCheck(meta, async () => ({
      count: 3,
      sample: ['a', 'b', 'c'],
    }));
    expect(result).toEqual({ ...meta, count: 3, ok: false, sample: ['a', 'b', 'c'], error: null });
  });

  it('a query that throws is reported as failed, not as a clean 0 — never masquerades as "clear"', async () => {
    const result = await runDataQualityCheck(meta, async () => {
      throw new Error('relation "widget" does not exist');
    });
    expect(result.ok).toBe(false);
    expect(result.count).toBe(0);
    expect(result.sample).toEqual([]);
    expect(result.error).toBe('relation "widget" does not exist');
  });

  it('a thrown non-Error value still produces a safe, generic error string', async () => {
    const result = await runDataQualityCheck(meta, async () => {
      throw 'a plain string was thrown';
    });
    expect(result.error).toBe('check failed');
  });

  it('truncates an unexpectedly long error message rather than returning it whole', async () => {
    const long = 'x'.repeat(5000);
    const result = await runDataQualityCheck(meta, async () => {
      throw new Error(long);
    });
    expect(result.error?.length).toBe(300);
  });
});

describe('sampleHash — decides whether a resolved data-quality finding stays closed or reopens', () => {
  it("is stable regardless of the sample array's original order", () => {
    expect(sampleHash(['RES-2', 'RES-1'])).toBe(sampleHash(['RES-1', 'RES-2']));
  });

  it('is stable across repeated calls with the same set', () => {
    expect(sampleHash(['RES-1', 'RES-2', 'RES-3'])).toBe(sampleHash(['RES-1', 'RES-2', 'RES-3']));
  });

  it('changes when even one sample key changes — a materially different occurrence', () => {
    expect(sampleHash(['RES-1', 'RES-2'])).not.toBe(sampleHash(['RES-1', 'RES-3']));
  });

  it('changes when the set grows or shrinks, even with the same members otherwise', () => {
    expect(sampleHash(['RES-1'])).not.toBe(sampleHash(['RES-1', 'RES-2']));
    expect(sampleHash([])).not.toBe(sampleHash(['RES-1']));
  });

  it('two entries that only differ by an embedded delimiter-like character never collide', () => {
    // guards against a naive join(',')-style implementation where 'a,b' and ['a','b']
    // could hash the same way — JSON.stringify keeps element boundaries unambiguous
    expect(sampleHash(['a,b'])).not.toBe(sampleHash(['a', 'b']));
  });
});

describe('utilizationPercent — dashboard analytics', () => {
  it('rounds the share of the fleet currently occupied', () => {
    expect(utilizationPercent(5, 10)).toBe(50);
    expect(utilizationPercent(1, 3)).toBe(33); // rounds, doesn't truncate to 0
    expect(utilizationPercent(2, 3)).toBe(67);
  });

  it('is 0%, not null, when nothing is occupied but the fleet exists', () => {
    expect(utilizationPercent(0, 10)).toBe(0);
  });

  it('is null, not 0%, when the org has no fleet at all — "nothing to measure" is not "0% used"', () => {
    expect(utilizationPercent(0, 0)).toBeNull();
  });

  it('is capped at 100% even if the input momentarily over-counts', () => {
    // the occupancy count and the fleet-size denominator are read at slightly different moments,
    // so a brief >100% is possible upstream — showing that verbatim would be a visibly
    // nonsensical number for a percentage
    expect(utilizationPercent(12, 10)).toBe(100);
  });
});

describe('csvCell — CSV/formula-injection safety (OWASP) for a report export cell', () => {
  it('passes an ordinary value through unchanged', () => {
    expect(csvCell('available')).toBe('available');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(null)).toBe('');
  });

  it('neutralizes a value that would open as a live formula in Excel/Sheets', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('a formula-prefixed value that also needs quoting gets both protections', () => {
    // the leading apostrophe is added first, then the whole cell is quoted because it now
    // contains a comma — if the order were reversed the quoting wouldn't see the comma
    expect(csvCell('=A1,B1')).toBe(`"'=A1,B1"`);
  });

  it('a value merely containing = elsewhere (not at the start) is left alone', () => {
    expect(csvCell('a=b')).toBe('a=b');
  });

  it('still quotes plain values containing a comma, quote, or newline', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });
});
