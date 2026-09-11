import { describe, expect, it } from 'vitest';

import { decodeAuditCursor, encodeAuditCursor } from './audit-cursor';

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
