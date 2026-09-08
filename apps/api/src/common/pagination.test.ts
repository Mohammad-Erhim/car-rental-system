import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor, toPage } from './pagination';

describe('cursor pagination (SRS-API-005)', () => {
  it('round-trips a cursor payload', () => {
    const c = encodeCursor({ k: '2026-01-01T00:00:00Z', id: 'abc' });
    expect(decodeCursor(c)).toEqual({ k: '2026-01-01T00:00:00Z', id: 'abc' });
  });

  it('rejects a malformed cursor without throwing', () => {
    expect(decodeCursor('not-base64!!')).toBeNull();
    expect(decodeCursor(Buffer.from('{}').toString('base64url'))).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });

  it('toPage trims to the limit and emits nextCursor only when there is more', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ id: `id${i}`, t: `t${i}` }));
    const page = toPage(rows, 5, (r) => ({ k: r.t, id: r.id }));
    expect(page.items).toHaveLength(5);
    expect(page.page.hasMore).toBe(true);
    expect(page.page.nextCursor).toBeTypeOf('string');

    const last = toPage(rows.slice(0, 3), 5, (r) => ({ k: r.t, id: r.id }));
    expect(last.page.hasMore).toBe(false);
    expect(last.page.nextCursor).toBeNull();
  });
});
