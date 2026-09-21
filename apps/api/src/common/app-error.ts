import {
  ERROR_CODE,
  ERROR_CODE_CATEGORY,
  ERROR_CODE_HTTP_STATUS,
  RETRYABLE_ERROR_CODES,
  type ErrorCode,
} from '@carrental/contracts';

export interface FieldIssue {
  path: string;
  code: string;
  params?: Record<string, string | number | boolean>;
}

export interface AppErrorOptions {
  /** Non-localized developer summary. */
  title?: string;
  /** Safe interpolation params for the client's localized message. No secrets, no record existence.
   *  (One deliberate exception: `payment_action_required` carries the processor's `clientSecret` —
   *  the customer's own single-use handle for completing their bank challenge. It is redacted from
   *  logs, and this filter never logs params.) */
  params?: Record<string, string | number | boolean | null>;
  fieldErrors?: FieldIssue[];
  /** Current authoritative version for conflict recovery (SRS-API-007). */
  currentVersion?: number;
  currentState?: string;
  /** Reference to the already-created result for duplicate commands (SRS-API-004). */
  existingResultRef?: string;
  cause?: unknown;
}

/**
 * The single error type domain + application code throws. The global filter renders it into the
 * API Problem envelope (SRS §14.1). Never leak stack traces, SQL, provider payloads, or secrets.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly category: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly params?: AppErrorOptions['params'];
  readonly fieldErrors?: FieldIssue[];
  readonly currentVersion?: number;
  readonly currentState?: string;
  readonly existingResultRef?: string;

  constructor(code: ErrorCode, opts: AppErrorOptions = {}) {
    super(opts.title ?? code);
    this.name = 'AppError';
    this.code = code;
    this.category = ERROR_CODE_CATEGORY[code];
    this.status = ERROR_CODE_HTTP_STATUS[code];
    this.retryable = RETRYABLE_ERROR_CODES.has(code);
    this.params = opts.params;
    this.fieldErrors = opts.fieldErrors;
    this.currentVersion = opts.currentVersion;
    this.currentState = opts.currentState;
    this.existingResultRef = opts.existingResultRef;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }

  static validation(fieldErrors: FieldIssue[], title = 'Validation failed'): AppError {
    return new AppError(ERROR_CODE.VALIDATION_FAILED, { title, fieldErrors });
  }

  static notFound(resource = 'resource'): AppError {
    return new AppError(ERROR_CODE.RESOURCE_NOT_FOUND, { title: `${resource} not found` });
  }

  static forbidden(title = 'Forbidden'): AppError {
    return new AppError(ERROR_CODE.FORBIDDEN, { title });
  }

  static conflict(currentVersion: number, currentState?: string): AppError {
    return new AppError(ERROR_CODE.VERSION_CONFLICT, {
      title: 'Version conflict',
      currentVersion,
      currentState,
    });
  }

  static businessRule(title: string, params?: AppErrorOptions['params']): AppError {
    return new AppError(ERROR_CODE.BUSINESS_RULE_VIOLATION, { title, params });
  }
}

export { ERROR_CODE };
