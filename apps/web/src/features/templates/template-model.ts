import type { TemplateVar } from '@/lib/admin-hooks';

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Root names of every `{{placeholder}}` used in the subject and body. */
export function referencedVars(subject: string, body: string): string[] {
  const names = new Set<string>();
  for (const m of `${subject}\n${body}`.matchAll(PLACEHOLDER)) names.add(m[1]!.split('.')[0]!);
  return [...names];
}

/** Placeholders used in the text that no declared variable covers. */
export function undeclaredVars(subject: string, body: string, vars: TemplateVar[]): string[] {
  const declared = new Set(vars.map((v) => v.name));
  return referencedVars(subject, body).filter((v) => !declared.has(v));
}

export const templatePath = (key: string, channel: string, locale?: string) =>
  `/config/templates/${encodeURIComponent(key)}/${encodeURIComponent(channel)}${
    locale ? `?locale=${encodeURIComponent(locale)}` : ''
  }`;

/** Languages to offer: the ones with a row plus every active language that has none yet. */
export function localeTabs(
  present: Array<{ localeCode: string; hasDraft: boolean }>,
  active: string[],
) {
  const tabs = [
    ...present.map((l) => ({ code: l.localeCode, hasDraft: l.hasDraft, started: true })),
    ...active
      .filter((code) => !present.some((l) => l.localeCode === code))
      .map((code) => ({ code, hasDraft: false, started: false })),
  ];
  // English (the source language) leads, the rest keep their order
  return tabs.sort((a, b) => Number(b.code === 'en') - Number(a.code === 'en'));
}
