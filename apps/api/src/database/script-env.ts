import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadEnv, resetEnvCache, type Env } from '../config/env.schema';

/** Load .env for standalone CLI scripts (migrate/seed/reset/openapi), then validate. */
export function bootstrapEnvForScript(): Env {
  resetEnvCache();
  if (process.env.NODE_ENV !== 'production') {
    for (const file of ['.env', '../../.env']) {
      try {
        const text = readFileSync(resolve(process.cwd(), file), 'utf8');
        for (const line of text.split('\n')) {
          const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
          if (!m) continue;
          const key = m[1];
          const rawVal = m[2] ?? '';
          if (key && process.env[key] === undefined) {
            process.env[key] = rawVal.replace(/^["']|["']$/g, '');
          }
        }
        break;
      } catch {
        /* ignore */
      }
    }
  }
  return loadEnv();
}
