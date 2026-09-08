/**
 * Run the Next.js **standalone** production server (the build target `next.config` selects).
 * `next start` is not supported with `output: 'standalone'` (its error / not-found boundaries
 * misrender), so tests and any non-Docker prod run go through here. Mirrors what
 * `deploy/Dockerfile.site` does: copy `public/` + `.next/static/` next to `server.js`, then run.
 */
import { cpSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// outputFileTracingRoot is the repo root, so the server lands under standalone/apps/site
const standaloneDir = join(appDir, '.next/standalone/apps/site');
const serverJs = join(standaloneDir, 'server.js');

if (!existsSync(serverJs)) {
  console.error(
    `No standalone build at ${serverJs}. Run \`pnpm --filter @carrental/site build\` first.`,
  );
  process.exit(1);
}

cpSync(join(appDir, 'public'), join(standaloneDir, 'public'), { recursive: true });
cpSync(join(appDir, '.next/static'), join(standaloneDir, '.next/static'), { recursive: true });

const port = process.env.PORT ?? '3000';
const child = spawn(process.execPath, [serverJs], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port, HOSTNAME: process.env.HOSTNAME ?? '0.0.0.0' },
});
child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
