import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';

import { MetricsService } from './metrics';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    // Use the Nest route path template, not the raw URL (avoids high cardinality — SRS-OBS-005).
    const route =
      (req.route?.path as string | undefined) ??
      (req.baseUrl || '') + (req.path?.replace(/\/[0-9a-f-]{8,}/gi, '/:id') ?? '');
    const end = this.metrics.httpDuration.startTimer({ method: req.method, route });

    return next.handle().pipe(
      tap({
        next: () => this.record(req.method, route, res.statusCode, end),
        error: () => this.record(req.method, route, res.statusCode || 500, end),
      }),
    );
  }

  private record(
    method: string,
    route: string,
    status: number,
    end: (labels?: Record<string, string | number>) => number,
  ): void {
    const statusClass = `${Math.floor(status / 100)}xx`;
    this.metrics.httpRequests.inc({ method, route, status: statusClass });
    end({ status: statusClass });
  }
}
