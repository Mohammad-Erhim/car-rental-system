import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

import { currentRequestId } from './correlation';
import { toProblem } from './problem';

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

    const problem = toProblem(exception, correlationId);

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
}
