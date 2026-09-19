/**
 * CSV cell escaping. A cell opening with `=`, `+`, `-` or `@` runs as a live formula the moment
 * the file is opened in Excel or Sheets (CSV injection, OWASP) — actor, reason and target id are
 * free text someone could influence — so a leading apostrophe forces "text" in both.
 */
export function csvCell(v: unknown): string {
  const raw = String(v ?? '');
  const s = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Trigger a browser download of CSV text. */
export function downloadCsvFile(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
