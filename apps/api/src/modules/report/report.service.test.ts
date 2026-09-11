import { describe, expect, it } from 'vitest';

import {
  decodeAuditCursor,
  encodeAuditCursor,
  isScheduleDue,
  nextFireAfter,
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

describe('audit log cursor round-trip', () => {
  it('decodes exactly what was encoded', () => {
    const cursor = encodeAuditCursor('2026-01-12T07:00:00.000Z', 4211);
    expect(decodeAuditCursor(cursor)).toEqual({
      occurredAt: '2026-01-12T07:00:00.000Z',
      seq: 4211,
    });
  });

  it('is opaque, URL-safe base64 — not a readable "occurredAt|seq" string', () => {
    const cursor = encodeAuditCursor('2026-01-12T07:00:00.000Z', 4211);
    expect(cursor).not.toContain('2026-01-12');
    expect(cursor).not.toMatch(/[+/=]/); // base64url, never the +/= that plain base64 can contain
  });

  it('two different rows never encode to the same cursor', () => {
    const a = encodeAuditCursor('2026-01-12T07:00:00.000Z', 4211);
    const b = encodeAuditCursor('2026-01-12T07:00:00.000Z', 4212);
    const c = encodeAuditCursor('2026-01-12T07:00:00.001Z', 4211);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('gracefully returns null for garbage input instead of throwing', () => {
    expect(decodeAuditCursor('not-a-real-cursor')).toBeNull();
    expect(decodeAuditCursor('')).toBeNull();
    // valid base64url, but not the "text|number" shape this cursor needs
    expect(decodeAuditCursor(Buffer.from('nonsense').toString('base64url'))).toBeNull();
  });
});
