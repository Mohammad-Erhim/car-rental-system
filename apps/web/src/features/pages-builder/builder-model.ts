import {
  zBlock,
  type Block,
  type BlockType,
  type Localized,
  type PageKey,
} from '@carrental/contracts';

import { ICON_OPTIONS, type FieldDef } from './block-defs';

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export const newId = () => Math.random().toString(36).slice(2, 10);

export const PAGE_NAME_KEY: Record<PageKey, string> = {
  home: 'home',
  help: 'help',
  'legal-terms': 'legalTerms',
  'legal-privacy': 'legalPrivacy',
  'legal-cookies': 'legalCookies',
};

/** Deep-map every string value in a JSON-serialisable tree. */
export function mapStrings<T>(node: T, fn: (s: string) => string): T {
  return JSON.parse(JSON.stringify(node, (_k, v) => (typeof v === 'string' ? fn(v) : v))) as T;
}

export const ASSET_URL_RE = /^(?:https?:\/\/[^/]+)?\/api\/v1\/assets\/([A-Za-z0-9._/-]+)\?/;

/** `/api/v1/assets/<key>?…` (or `obj:<key>`) → `obj:<key>`; anything else unchanged. */
export const toStorageRef = (s: string): string => {
  const m = s.match(ASSET_URL_RE);
  return m ? `obj:${m[1]}` : s;
};

export const isLocalized = (v: unknown): v is Localized =>
  !!v && typeof v === 'object' && 'en' in (v as Record<string, unknown>);

export function makeBlock(type: BlockType): Block {
  return zBlock.parse({
    id: newId(),
    type,
    tone: type === 'hero' || type === 'stats' ? 'brand' : 'default',
  });
}

export function swap<T>(a: T[], i: number, j: number): T[] {
  const n = [...a];
  [n[i], n[j]] = [n[j]!, n[i]!];
  return n;
}

/** Move the item with `id` one step up (-1) or down (1); unchanged at the ends. */
export function moveById<T extends { id: string }>(list: T[], id: string, dir: -1 | 1): T[] {
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  return swap(list, i, j);
}

/** A blank item for a repeating field group. */
export function emptyItem(fields: FieldDef[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === 'ltext' || f.kind === 'larea') o[f.key] = { en: '' };
    else if (f.kind === 'icon') o[f.key] = ICON_OPTIONS[0];
    else if (f.kind === 'num') o[f.key] = f.min ?? 0;
    else if (f.kind === 'bool') o[f.key] = false;
    else if (f.kind === 'text') o[f.key] = '';
  }
  return o;
}

/** Device widths the preview emulates by rendering the site at that width and scaling it down. */
export const DEVICE_W = { desktop: 1280, tablet: 834, mobile: 390 } as const;
export type Viewport = keyof typeof DEVICE_W;

/** Scale that fits a device of `deviceW` into `containerW`, never enlarging and never below 20%. */
export const fitScale = (containerW: number, deviceW: number) =>
  Math.min(1, Math.max(0.2, (containerW - 4) / deviceW));
