import { createHash } from 'node:crypto';

/**
 * Short content hash — the "revision" of an English source string. A translation is stale when the
 * source text it was made against no longer hashes to the `sourceRevision` stored with it. Shared
 * by the translation catalogue and the reference-data label editor (both write `translation` rows).
 */
export function revOf(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 12);
}
