import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';

import { runWithCorrelation } from '../common/correlation';

/**
 * Establishes an AsyncLocalStorage correlation context per request so every log line, domain
 * command, outbox event, and provider attempt shares the same trace/request id (SRS-OBS-003).
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ??
      (req.headers['x-correlation-id'] as string | undefined) ??
      uuid();
    const traceId = (req.headers['x-trace-id'] as string | undefined) ?? requestId;

    res.setHeader('x-correlation-id', requestId);
    runWithCorrelation({ requestId, traceId, actorType: 'anonymous' }, () => next());
  }
}
