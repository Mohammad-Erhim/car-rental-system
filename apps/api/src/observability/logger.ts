import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Params } from 'nestjs-pino';

import { getCorrelation } from '../common/correlation';
import { loadEnv } from '../config/env.schema';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'req.body.password',
  'req.body.newPassword',
  'req.body.currentPassword',
  'req.body.token',
  'req.body.code',
  'req.body.cardNumber',
  'req.body.cvv',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.secret',
  '*.clientSecret',
  '*.accessToken',
  '*.refreshToken',
  '*.cardNumber',
  '*.cvv',
  '*.pan',
];

export function buildLoggerParams(): Params {
  const env = loadEnv();
  const isDev = env.NODE_ENV === 'development';
  const isTest = env.NODE_ENV === 'test';

  try {
    mkdirSync(resolve(process.cwd(), 'var/log'), { recursive: true });
  } catch {
    /* ignore */
  }

  return {
    pinoHttp: {
      level: isTest ? 'silent' : env.LOG_LEVEL,
      // structured JSON with the SRS-OBS-001 fields
      base: {
        service: 'carrental-api',
        env: env.NODE_ENV,
        version: env.GIT_SHA ?? 'dev',
      },
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      genReqId: (req, res) => {
        const existing =
          (req.headers['x-request-id'] as string | undefined) ??
          (req.headers['x-correlation-id'] as string | undefined);
        const id = existing ?? crypto.randomUUID();
        res.setHeader('x-correlation-id', id);
        return id;
      },
      customProps: () => {
        const ctx = getCorrelation();
        return ctx
          ? { traceId: ctx.traceId, requestId: ctx.requestId, actorType: ctx.actorType }
          : {};
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      autoLogging: {
        ignore: (req) => req.url === '/health/live' || req.url === '/metrics',
      },
      // pino-pretty runs in a worker thread (thread-stream); on constrained/sandboxed hosts it
      // can stall startup. Opt in explicitly with LOG_PRETTY=1.
      transport:
        isDev && process.env.LOG_PRETTY === '1'
          ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss.l' } }
          : undefined,
    },
  };
}
