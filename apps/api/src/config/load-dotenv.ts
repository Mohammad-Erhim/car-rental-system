import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal .env loader (dev/test only). Does not override an already-set variable.
 * Looks in CWD then the repo root. No dependency on dotenv.
 */
export function loadDotEnv(): void {
  if (process.env.SKIP_DOTENV === '1' || process.env.NODE_ENV === 'production') return;
  for (const rel of ['.env', '../../.env']) {
    try {
      const text = readFileSync(resolve(process.cwd(), rel), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const key = m[1];
        const rawVal = (m[2] ?? '').replace(/^["']|["']$/g, '');
        if (key && process.env[key] === undefined) process.env[key] = rawVal;
      }
      return;
    } catch {
      /* try next path */
    }
  }
}
