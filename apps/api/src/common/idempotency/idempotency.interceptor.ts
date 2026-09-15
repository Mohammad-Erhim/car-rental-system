import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, from, of, switchMap, tap } from 'rxjs';

import type { Actor } from '../auth/types';
import { currentRequestId } from '../correlation';
import { toProblem } from '../problem';

import { IdempotencyService } from './idempotency.service';

export const IDEMPOTENT = 'idempotency:operation';

/**
 * Mark a mutation as idempotent. Requires the client to send `Idempotency-Key`; a replay
 * returns the stored result, a fingerprint mismatch is a 409 (SRS-API-006).
 */
export const Idempotent = (operation: string) => SetMetadata(IDEMPOTENT, operation);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly service: IdempotencyService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const operation = this.reflector.getAllAndOverride<string>(IDEMPOTENT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!operation) return next.handle();

    const req = context.switchToHttp().getRequest<Request & { actor?: Actor }>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.header('Idempotency-Key');
    if (!key) return next.handle(); // optional; callers that need safety send the header

    const actorKey = req.actor ? `${req.actor.kind}:${req.actor.accountId}` : `anon:${req.ip}`;

    return from(this.service.begin({ actorKey, operation, key, body: req.body })).pipe(
      switchMap((result) => {
        if (result.status === 'replay') {
          res.status(result.responseStatus);
          res.setHeader('Idempotency-Replayed', 'true');
          return of(result.responseBody);
        }
        return next.handle().pipe(
          tap({
            next: (body) => {
              void result.finalize(res.statusCode ?? 200, body as unknown);
            },
            error: (err: unknown) => {
              // Store the REAL status/body the client would have received (e.g. a 409 conflict
              // or 422 validation failure), not a hardcoded 500 — a retry with the same
              // Idempotency-Key must replay the actual, actionable error rather than a misleading
              // generic failure for the life of the key (24h, see IdempotencyService's TTL_MS).
              const problem = toProblem(err, currentRequestId());
              void result.finalize(problem.status, problem);
            },
          }),
        );
      }),
    );
  }
}
