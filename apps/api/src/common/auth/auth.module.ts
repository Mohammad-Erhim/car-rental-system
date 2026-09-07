import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { RateLimitGuard } from '../security/rate-limit.guard';

import { ActorService } from './actor.service';
import { AuthGuard } from './auth.guard';
import { PasswordService } from './password.service';
import { PermissionsGuard } from './permissions.guard';
import { RbacService } from './rbac.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

/**
 * Global auth wiring. RateLimitGuard runs first (caps abuse-prone routes before auth work),
 * then AuthGuard + PermissionsGuard on every route; routes opt out with @Public() /
 * @OptionalAuth() and opt in to permissions with @Permissions().
 */
@Global()
@Module({
  providers: [
    PasswordService,
    TokenService,
    SessionService,
    RbacService,
    ActorService,
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [PasswordService, TokenService, SessionService, RbacService, ActorService],
})
export class AuthModule {}
