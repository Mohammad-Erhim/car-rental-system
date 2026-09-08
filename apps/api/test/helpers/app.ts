import type { NestExpressApplication } from '@nestjs/platform-express';

import { createApp } from '../../src/bootstrap';

let app: NestExpressApplication | null = null;

export async function getTestApp(): Promise<NestExpressApplication> {
  if (!app) {
    app = await createApp();
    await app.init();
  }
  return app;
}

export async function closeTestApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}

export function httpServer(a: NestExpressApplication) {
  return a.getHttpServer();
}
