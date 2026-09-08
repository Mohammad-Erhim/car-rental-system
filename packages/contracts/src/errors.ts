/**
 * Stable, language-neutral error codes (SRS-API-004, SRS-I18N-004, SRS §14.1).
 * Clients map these to localized messages; the code and its category never change meaning.
 */

export const ERROR_CATEGORY = {
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  RATE_LIMIT: 'rate_limit',
  DEPENDENCY: 'dependency',
  BUSINESS_RULE: 'business_rule',
  INTERNAL: 'internal',
} as const;
export type ErrorCategory = (typeof ERROR_CATEGORY)[keyof typeof ERROR_CATEGORY];

export const ERROR_CODE = {
  // validation
  VALIDATION_FAILED: 'validation_failed',
  // auth
  AUTH_REQUIRED: 'auth_required',
  AUTH_INVALID_CREDENTIALS: 'auth_invalid_credentials',
  AUTH_SESSION_EXPIRED: 'auth_session_expired',
  AUTH_STEP_UP_REQUIRED: 'auth_step_up_required',
  AUTH_ACCOUNT_LOCKED: 'auth_account_locked',
  // authorization
  FORBIDDEN: 'forbidden',
  SCOPE_VIOLATION: 'scope_violation',
  APPROVAL_REQUIRED: 'approval_required',
  // not found
  RESOURCE_NOT_FOUND: 'resource_not_found',
  // conflict / concurrency
  VERSION_CONFLICT: 'version_conflict',
  DUPLICATE_REQUEST: 'duplicate_request',
  IDEMPOTENCY_KEY_MISMATCH: 'idempotency_key_mismatch',
  STATE_CONFLICT: 'state_conflict',
  // rate limit
  RATE_LIMITED: 'rate_limited',
  // dependency / provider
  DEPENDENCY_UNAVAILABLE: 'dependency_unavailable',
  PROVIDER_TIMEOUT: 'provider_timeout',
  PROVIDER_UNKNOWN_RESULT: 'provider_unknown_result',
  // business rule
  BUSINESS_RULE_VIOLATION: 'business_rule_violation',
  AVAILABILITY_LOST: 'availability_lost',
  QUOTE_EXPIRED: 'quote_expired',
  ELIGIBILITY_FAILED: 'eligibility_failed',
  POLICY_NOT_CONFIGURED: 'policy_not_configured',
  // internal
  INTERNAL_ERROR: 'internal_error',
} as const;
export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export const ERROR_CODE_CATEGORY: Record<ErrorCode, ErrorCategory> = {
  validation_failed: ERROR_CATEGORY.VALIDATION,
  auth_required: ERROR_CATEGORY.AUTHENTICATION,
  auth_invalid_credentials: ERROR_CATEGORY.AUTHENTICATION,
  auth_session_expired: ERROR_CATEGORY.AUTHENTICATION,
  auth_step_up_required: ERROR_CATEGORY.AUTHENTICATION,
  auth_account_locked: ERROR_CATEGORY.AUTHENTICATION,
  forbidden: ERROR_CATEGORY.AUTHORIZATION,
  scope_violation: ERROR_CATEGORY.AUTHORIZATION,
  approval_required: ERROR_CATEGORY.AUTHORIZATION,
  resource_not_found: ERROR_CATEGORY.NOT_FOUND,
  version_conflict: ERROR_CATEGORY.CONFLICT,
  duplicate_request: ERROR_CATEGORY.CONFLICT,
  idempotency_key_mismatch: ERROR_CATEGORY.CONFLICT,
  state_conflict: ERROR_CATEGORY.CONFLICT,
  rate_limited: ERROR_CATEGORY.RATE_LIMIT,
  dependency_unavailable: ERROR_CATEGORY.DEPENDENCY,
  provider_timeout: ERROR_CATEGORY.DEPENDENCY,
  provider_unknown_result: ERROR_CATEGORY.DEPENDENCY,
  business_rule_violation: ERROR_CATEGORY.BUSINESS_RULE,
  availability_lost: ERROR_CATEGORY.BUSINESS_RULE,
  quote_expired: ERROR_CATEGORY.BUSINESS_RULE,
  eligibility_failed: ERROR_CATEGORY.BUSINESS_RULE,
  policy_not_configured: ERROR_CATEGORY.BUSINESS_RULE,
  internal_error: ERROR_CATEGORY.INTERNAL,
};

export const ERROR_CODE_HTTP_STATUS: Record<ErrorCode, number> = {
  validation_failed: 422,
  auth_required: 401,
  auth_invalid_credentials: 401,
  auth_session_expired: 401,
  auth_step_up_required: 401,
  auth_account_locked: 423,
  forbidden: 403,
  scope_violation: 403,
  approval_required: 403,
  resource_not_found: 404,
  version_conflict: 409,
  duplicate_request: 409,
  idempotency_key_mismatch: 409,
  state_conflict: 409,
  rate_limited: 429,
  dependency_unavailable: 503,
  provider_timeout: 504,
  provider_unknown_result: 502,
  business_rule_violation: 422,
  availability_lost: 409,
  quote_expired: 409,
  eligibility_failed: 422,
  policy_not_configured: 503,
  internal_error: 500,
};

/** Codes whose operation may be safely retried by the client as-is (SRS-API-004). */
export const RETRYABLE_ERROR_CODES: ReadonlySet<ErrorCode> = new Set([
  ERROR_CODE.RATE_LIMITED,
  ERROR_CODE.DEPENDENCY_UNAVAILABLE,
  ERROR_CODE.PROVIDER_TIMEOUT,
]);
