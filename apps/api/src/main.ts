import './config/bootstrap-env';

import { createApp } from './bootstrap';
import { loadEnv } from './config/env.schema';

async function main() {
  const env = loadEnv();
  const app = await createApp();
  await app.listen(env.API_PORT, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(
    `[api] listening on http://localhost:${env.API_PORT}  ` +
      `(docs: /api/v1/docs, health: /health/ready)`,
  );
}

main().catch((err) => {
  console.error('[api] failed to start:', err);
  process.exit(1);
});
