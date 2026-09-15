/**
 * Renders the 5 vehicle-category illustrations (see `../src/database/seed/car-art.ts`) to real
 * PNG files committed under `src/database/seed/assets/vehicle-category/` — so the images
 * genuinely exist in the repo (visible in a diff, present right after `git clone`, no seed run
 * required to produce the bytes) rather than only being generated on the fly at seed time.
 * `seedDiscovery` reads these committed files; re-run this script and commit the result if the
 * source art in `car-art.ts` ever changes.
 *
 *   node -r @swc-node/register scripts/gen-car-art.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderCarArtPng, type CarVariant } from '../src/database/seed/car-art';

const VARIANTS: CarVariant[] = ['economy', 'compact', 'intermediate', 'suv', 'premium', 'van'];
const outDir = join(__dirname, '../src/database/seed/assets/vehicle-category');

mkdirSync(outDir, { recursive: true });
for (const variant of VARIANTS) {
  const png = renderCarArtPng(variant);
  const path = join(outDir, `${variant}.png`);
  writeFileSync(path, png);
  // eslint-disable-next-line no-console -- CLI progress output, mirrors seed.ts's own logging
  console.log(`wrote ${variant}.png (${png.byteLength} bytes)`);
}
