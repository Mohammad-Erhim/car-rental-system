import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AppError } from '../app-error';
import { setActor } from '../correlation';

import { ActorService } from './actor.service';
import { AUDIENCE, IS_PUBLIC, OPTIONAL_AUTH } from './decorators';
import { TokenService } from './token.service';
import type { Actor } from './types';

export {
  Public,
  OptionalAuth,
  RequireAudience,
  IS_PUBLIC,
  OPTIONAL_AUTH,
  AUDIENCE,
} from './decorators';

/** @CurrentActor() — injects the authenticated Actor (throws if the route required auth). */
export const CurrentActor = createParamDecorator((_data, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<Request & { actor?: Actor }>();
  if (!req.actor) throw new AppError('auth_required');
  return req.actor;
});

/** @MaybeCurrentActor() — injects the Actor or undefined. */
export const MaybeCurrentActor = createParamDecorator(
  (_data, ctx: ExecutionContext): Actor | undefined => {
    return ctx.switchToHttp().getRequest<Request & { actor?: Actor }>().actor;
  },
);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly actors: ActorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredAudience = this.reflector.getAllAndOverride<'customer' | 'staff' | undefined>(
      AUDIENCE,
      [context.getHandler(), context.getClass()],
    );

    const req = context.switchToHttp().getRequest<Request & { actor?: Actor }>();
    const token = extractToken(req);

    if (!token) {
      if (isPublic || optional) return true;
      throw new AppError('auth_required');
    }

    const claims = await this.tokens.verifyAccess(token);
    if (!claims) {
      if (isPublic || optional) return true;
      throw new AppError('auth_session_expired', { title: 'Access token invalid or expired' });
    }

    const actor = await this.actors.fromClaims(claims);
    if (!actor) {
      if (isPublic || optional) return true;
      throw new AppError('auth_required', { title: 'Account is not active' });
    }

    if (requiredAudience && actor.audience !== requiredAudience) {
      throw new AppError('forbidden', {
        title: `This endpoint requires a ${requiredAudience} session`,
      });
    }

    req.actor = actor;
    setActor(actor.accountId, actor.kind);
    return true;
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  // cookie-authenticated access token (browser) is not used; browser holds access in memory
  return null;
}
