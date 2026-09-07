import {
  ERROR_CODE,
  ERROR_CODE_CATEGORY,
  type ErrorCode,
  type Problem,
} from '@carrental/contracts';
import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { AppError } from './app-error';
import { currentRequestId } from './correlation';

/**
 * Renders every thrown error into the stable Problem envelope (SRS §14.1, SRS-API-004/008).
 * Stack traces, SQL, provider payloads, secrets, and internal authorization detail are never
 * returned to clients.
 */
@Catch()
export class GlobalErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const correlationId = currentRequestId();

    const problem = this.toProblem(exception, correlationId);

    // Log server-side with full detail; respond with the safe envelope only.
    if (problem.status >= 500) {
      this.logger.error(
        { err: exception, code: problem.code, path: req.originalUrl, correlationId },
        `Unhandled ${problem.code}`,
      );
    } else {
      this.logger.warn(
        { code: problem.code, status: problem.status, path: req.originalUrl, correlationId },
        `Handled ${problem.code}`,
      );
    }

    res.setHeader('x-correlation-id', correlationId);
    res.status(problem.status).json(problem);
  }

  private toProblem(exception: unknown, correlationId: string): Problem {
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
      const code = this.mapHttpStatusToCode(status);
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

  private mapHttpStatusToCode(status: number): string {
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
}
