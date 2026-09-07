import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';

import { AppError } from './app-error';

/**
 * Validates a request part against a Zod schema and returns the parsed value.
 * Unknown fields are stripped (mass-assignment protection, SRS-API-003).
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw AppError.validation(
      result.error.issues.map((i) => ({
        path: i.path.join('.'),
        code: i.code,
        params:
          'expected' in i && i.expected !== undefined
            ? { expected: String(i.expected) }
            : undefined,
      })),
    );
  }
}

export function zodBody(schema: ZodTypeAny): ZodValidationPipe {
  return new ZodValidationPipe(schema);
}
