import type { ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AppError, ERROR_CODE } from '../app-error';
import { runWithCorrelation } from '../correlation';

import { IdempotencyInterceptor } from './idempotency.interceptor';
import type { IdempotencyService } from './idempotency.service';

/** Minimal fakes — no Nest bootstrap, no DB. Proves the interceptor's own error-handling logic. */
function fakeReflector(operation: string | undefined) {
  return { getAllAndOverride: () => operation } as unknown as import('@nestjs/core').Reflector;
}

function fakeContext(opts: { body?: unknown; statusCode?: number }) {
  const res = { statusCode: opts.statusCode ?? 200, setHeader: vi.fn(), status: vi.fn() };
  const req = { header: () => 'idem-key-1', body: opts.body ?? {}, ip: '1.2.3.4' };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

describe('IdempotencyInterceptor', () => {
  it('on a failed mutation, stores the real thrown status/body — not a hardcoded 500', async () => {
    const finalize = vi.fn().mockResolvedValue(undefined);
    const service = {
      begin: vi.fn().mockResolvedValue({ status: 'proceed', finalize }),
    } as unknown as IdempotencyService;
    const interceptor = new IdempotencyInterceptor(fakeReflector('op'), service);

    const conflictError = new AppError(ERROR_CODE.VERSION_CONFLICT, {
      title: 'Version conflict',
      currentVersion: 3,
    });
    const next = { handle: () => throwError(() => conflictError) };

    await runWithCorrelation({ requestId: 'req-1', traceId: 'trace-1' }, async () => {
      // The interceptor's error tap is fire-and-forget (`void result.finalize(...)`), so the
      // observable itself still errors to the caller — subscribe and swallow that, then assert
      // on what got stored.
      await expect(firstValueFrom(interceptor.intercept(fakeContext({}), next))).rejects.toBe(
        conflictError,
      );
    });

    expect(finalize).toHaveBeenCalledTimes(1);
    const [status, body] = finalize.mock.calls[0]!;
    expect(status).toBe(409); // AppError.status for VERSION_CONFLICT, not a hardcoded 500
    expect(body).toMatchObject({
      code: ERROR_CODE.VERSION_CONFLICT,
      status: 409,
      currentVersion: 3,
    });
  });

  it('on success, stores the real response status/body', async () => {
    const finalize = vi.fn().mockResolvedValue(undefined);
    const service = {
      begin: vi.fn().mockResolvedValue({ status: 'proceed', finalize }),
    } as unknown as IdempotencyService;
    const interceptor = new IdempotencyInterceptor(fakeReflector('op'), service);
    const next = { handle: () => of({ ok: true }) };

    const result = await firstValueFrom(
      interceptor.intercept(fakeContext({ statusCode: 201 }), next),
    );

    expect(result).toEqual({ ok: true });
    expect(finalize).toHaveBeenCalledWith(201, { ok: true });
  });

  it('a replay returns the stored real status, not a synthesized one', async () => {
    const service = {
      begin: vi.fn().mockResolvedValue({
        status: 'replay',
        responseStatus: 422,
        responseBody: { code: 'validation_failed' },
      }),
    } as unknown as IdempotencyService;
    const interceptor = new IdempotencyInterceptor(fakeReflector('op'), service);
    const context = fakeContext({});
    const next = { handle: vi.fn() };

    const result = await firstValueFrom(interceptor.intercept(context, next as never));

    expect(result).toEqual({ code: 'validation_failed' });
    expect(next.handle).not.toHaveBeenCalled();
    const res = context.switchToHttp().getResponse<{ status: ReturnType<typeof vi.fn> }>();
    expect(res.status).toHaveBeenCalledWith(422);
  });
});
