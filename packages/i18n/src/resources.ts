/**
 * Static resource bundles for the build/tests/first-paint. At runtime the web app merges
 * additional namespaces fetched from the `config` module (translation catalogue, SCREEN-OPS-034).
 */

import arCommon from './locales/ar/common.json';
import enCommon from './locales/en/common.json';
import frCommon from './locales/fr/common.json';
import type { ResourceBundle } from './translator';

/** locale -> namespace -> (key -> message) */
export const NAMESPACED_RESOURCES: Record<string, Record<string, Record<string, string>>> = {
  en: { common: enCommon },
  fr: { common: frCommon },
  ar: { common: arCommon },
};

/** Flatten namespaced resources into `common.key` style keys for the translator. */
export function flattenResources(
  source: Record<string, Record<string, Record<string, string>>>,
): ResourceBundle {
  const out: ResourceBundle = {};
  for (const [locale, namespaces] of Object.entries(source)) {
    out[locale] = {};
    for (const [ns, entries] of Object.entries(namespaces)) {
      for (const [key, value] of Object.entries(entries)) {
        // `common` is the default namespace: expose both `key` and `common.key`.
        out[locale][ns === 'common' ? key : `${ns}.${key}`] = value;
        out[locale][`${ns}.${key}`] = value;
      }
    }
  }
  return out;
}

export const BASE_RESOURCES: ResourceBundle = flattenResources(NAMESPACED_RESOURCES);
