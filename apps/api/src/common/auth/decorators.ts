import { SetMetadata } from '@nestjs/common';

/**
 * Auth route decorators. Kept dependency-free so any module can import them without pulling
 * the guard/service graph.
 */
export const IS_PUBLIC = 'auth:public';
export const OPTIONAL_AUTH = 'auth:optional';
export const AUDIENCE = 'auth:audience';

/** Route requires no authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Attach the actor if a valid token is present, but do not require it. */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH, true);
/** Required session audience for a route. */
export const RequireAudience = (aud: 'customer' | 'staff') => SetMetadata(AUDIENCE, aud);
