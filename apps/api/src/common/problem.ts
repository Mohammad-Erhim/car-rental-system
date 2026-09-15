import {
  ERROR_CODE,
  ERROR_CODE_CATEGORY,
  type ErrorCode,
  type Problem,
} from '@carrental/contracts';
import { HttpException } from '@nestjs/common';
import { ZodError } from 'zod';

import { AppError } from './app-error';

/**
 * Renders any thrown error into the stable Problem envelope (SRS §14.1, SRS-API-004/008).
 * Shared by {@link GlobalErrorFilter} (the actual HTTP response) and the idempotency interceptor
 * (which needs the same status/body to store for a replay) so the two never drift.
 */
export function toProblem(exception: unknown, correlationId: string): Problem {
  if (exception instanceof AppError) {
    return {
      code: exception.code,
      category: exception.category,
      status: exception.status,
      title: exception.message,
      correlationId,
      params: exception.params,
      fieldErrors: exception.fieldErrors,
      retryable: exception.retryable || undefined,
      currentVersion: exception.currentVersion,
      currentState: exception.currentState,
      existingResultRef: exception.existingResultRef,
    };
  }

  if (exception instanceof ZodError) {
    return {
      code: ERROR_CODE.VALIDATION_FAILED,
      category: 'validation',
      status: 422,
      title: 'Validation failed',
      correlationId,
      fieldErrors: exception.issues.map((i) => ({
        path: i.path.join('.'),
        code: i.code,
        params: 'expected' in i ? { expected: String(i.expected) } : undefined,
      })),
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    const title =
      typeof body === 'string'
        ? body
        : (((body as Record<string, unknown>)?.message as string) ?? exception.message);
    const code = mapHttpStatusToCode(status);
    return {
      code,
      category:
        ERROR_CODE_CATEGORY[code as ErrorCode] ?? (status >= 500 ? 'internal' : 'business_rule'),
      status,
      title: Array.isArray(title) ? title.join('; ') : String(title),
      correlationId,
    };
  }

  return {
    code: ERROR_CODE.INTERNAL_ERROR,
    category: 'internal',
    status: 500,
    title: 'Internal error',
    correlationId,
  };
}

function mapHttpStatusToCode(status: number): string {
  switch (status) {
    case 400:
    case 422:
      return ERROR_CODE.VALIDATION_FAILED;
    case 401:
      return ERROR_CODE.AUTH_REQUIRED;
    case 403:
      return ERROR_CODE.FORBIDDEN;
    case 404:
      return ERROR_CODE.RESOURCE_NOT_FOUND;
    case 409:
      return ERROR_CODE.STATE_CONFLICT;
    case 429:
      return ERROR_CODE.RATE_LIMITED;
    case 503:
      return ERROR_CODE.DEPENDENCY_UNAVAILABLE;
    default:
      return ERROR_CODE.INTERNAL_ERROR;
  }
}
