const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Declared-variable names referenced in one or more template texts (subject + body). */
export function referencedVars(...texts: string[]): string[] {
  const set = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(VAR_RE)) set.add(m[1]!.split('.')[0]!);
  return [...set];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Interpolate `{{var}}`/`{{var.path}}` placeholders. The template's own authored text is
 * trusted content (written by a staff editor through the draft/submit/publish workflow); each
 * *interpolated value* is escaped by default, because it can carry customer-controlled data
 * (e.g. a registered full name) and this same body is what a real HTML mail transport would
 * eventually render. `escape: false` exists only for a caller building a genuinely non-HTML
 * message (SMS/push) where escaping would just add literal ampersands and quotes.
 */
export function renderTemplate(
  tpl: string,
  vars: Record<string, unknown>,
  opts: { escape?: boolean } = {},
): string {
  const escape = opts.escape ?? true;
  return tpl.replace(VAR_RE, (_, k: string) => {
    const v = k
      .split('.')
      .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], vars);
    if (v == null) return '';
    const s = String(v);
    return escape ? escapeHtml(s) : s;
  });
}
