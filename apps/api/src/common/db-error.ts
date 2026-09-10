/**
 * Postgres error-code helpers. The driver surfaces the SQLSTATE either on the error itself or on
 * its `cause`, so both are checked.
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
function sqlState(err: unknown): string | undefined {
  return (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
}

/** 23505 — unique_violation (a duplicate key). */
export function isUniqueViolation(err: unknown): boolean {
  return sqlState(err) === '23505';
}
