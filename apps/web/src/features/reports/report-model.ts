export const CRON_PRESETS = [
  { value: '0 7 * * 1', labelKey: 'ops.rpt.cronWeekly' },
  { value: '0 7 * * *', labelKey: 'ops.rpt.cronDaily' },
  { value: '0 7 1 * *', labelKey: 'ops.rpt.cronMonthly' },
] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Split a pasted list ("a@x.com, b@y.com; c@z.com") into trimmed addresses. */
export const parseRecipients = (raw: string) =>
  raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

export const recipientsValid = (list: string[]) =>
  list.length > 0 && list.every((r) => EMAIL.test(r));

/** Trigger a browser download of CSV text. */
export function downloadCsv(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
