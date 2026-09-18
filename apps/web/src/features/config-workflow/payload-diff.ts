/** `{a: {b: 1}}` → `{'a.b': '1'}`. Payload shape varies by config kind, so one recursive flatten
 *  serves every kind without a renderer per kind. */
export function flatten(value: unknown, prefix = '', out: Record<string, string> = {}) {
  if (value === null || value === undefined) {
    out[prefix || '(root)'] = 'null';
  } else if (Array.isArray(value)) {
    if (value.length === 0) out[prefix || '(root)'] = '[]';
    else value.forEach((v, i) => flatten(v, prefix ? `${prefix}[${i}]` : `[${i}]`, out));
  } else if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) out[prefix || '(root)'] = '{}';
    else for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix || '(root)'] = String(value);
  }
  return out;
}

export interface FieldChange {
  path: string;
  before: string | undefined;
  after: string | undefined;
}

/**
 * Field-level changes between two payloads, so a reviewer sees what is different rather than the
 * whole config. `before` is what is live now; with no prior published revision (the first
 * publish) every field simply shows as new.
 */
export function diffPayloads(before: unknown, after: unknown): FieldChange[] {
  const b = before === undefined ? {} : flatten(before);
  const a = flatten(after ?? {});
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .sort((x, y) => x.localeCompare(y))
    .filter((p) => b[p] !== a[p])
    .map((p) => ({ path: p, before: b[p], after: a[p] }));
}
