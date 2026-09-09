import type { Problem } from '@carrental/contracts';

/**
 * A failed API call, carrying the RFC7807-style `Problem` body the NestJS boundary returns
 * (SRS-API-004). One definition for every browser surface — never re-declare this per app.
 */
export class ApiError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.title || problem.code);
    this.name = 'ApiError';
    this.problem = problem;
  }

  get code(): string {
    return this.problem.code;
  }

  get status(): number {
    return this.problem.status;
  }

  get fieldErrors() {
    return this.problem.fieldErrors ?? [];
  }
}
