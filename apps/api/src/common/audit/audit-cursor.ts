/**
 * Keyset (cursor) pagination for the `audit_event` table — shared by every module reading it
 * (report.service.ts's audit log, consent.service.ts's consent log), not duplicated: they're
 * paging the same append-only table with the same `(occurred_at, seq)` ordering, so the cursor
 * format and its edge cases (opacity, uniqueness, garbage input) only need to be right once.
 *
 * An opaque token encoding the `(occurred_at, seq)` of the last row a page ended on. Base64url so
 * it's URL-safe with no extra escaping; deliberately opaque (not a bare `occurredAt|seq` string)
 * so callers treat it as a token, never construct or parse one themselves. `seq` — the table's own
 * bigserial PK, strictly insertion-ordered — is part of the cursor because `occurred_at` alone
 * isn't guaranteed unique (several events can share an exact timestamp); paired with `seq`,
 * Postgres's native row-comparison (`(a, b) < (x, y)`) gets an exact, stable ordering to resume
 * from at any depth, unlike `OFFSET`'s O(N) walk-and-discard cost.
 */
export function encodeAuditCursor(occurredAt: string, seq: number): string {
  return Buffer.from(`${occurredAt}|${seq}`, 'utf8').toString('base64url');
}

export function decodeAuditCursor(cursor: string): { occurredAt: string; seq: number } | null {
  try {
    const [occurredAt, seqStr] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const seq = Number(seqStr);
    if (!occurredAt || !Number.isFinite(seq)) return null;
    return { occurredAt, seq };
  } catch {
    return null;
  }
}
