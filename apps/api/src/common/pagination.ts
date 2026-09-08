/**
 * Opaque cursor pagination (SRS-API-005, SRS-DAT / §9.4 "unbounded list queries are prohibited").
 * Cursor encodes the last row's stable sort keys as base64url JSON.
 */

export interface CursorPayload {
  /** primary sort value (ISO string or number as string) */
  k: string;
  /** tie-breaker id */
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): CursorPayload | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed?.k === 'string' && typeof parsed?.id === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

export interface Page<T> {
  items: T[];
  page: { nextCursor: string | null; hasMore: boolean };
}

export function toPage<T>(
  rows: T[],
  limit: number,
  makeCursor: (row: T) => CursorPayload,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    page: {
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(makeCursor(last)) : null,
    },
  };
}
