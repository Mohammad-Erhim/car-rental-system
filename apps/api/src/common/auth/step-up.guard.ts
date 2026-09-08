import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { AppError } from '../app-error';

import type { Actor } from './types';

export const STEP_UP = 'auth:stepup';

/**
 * SRS-SEC-014 — mark a route as requiring a *recent* full password auth. The holder must have
 * signed in (or run `POST /auth/step-up`) within `STEP_UP_MAX_AGE_SEC`; otherwise the request
 * is refused with `auth_step_up_required` and the client re-prompts for the password.
 */
export const StepUp = () => SetMetadata(STEP_UP, true);

@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(STEP_UP, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest<Request & { actor?: Actor }>();
    const actor = req.actor;
    if (!actor) throw new AppError('auth_required');

    const maxAgeSec = this.env.STEP_UP_MAX_AGE_SEC;
    const lastMs = actor.lastFullAuthAt ? new Date(actor.lastFullAuthAt).getTime() : 0;
    const ageSec = (Date.now() - lastMs) / 1000;
    if (!lastMs || ageSec > maxAgeSec) {
      throw new AppError('auth_step_up_required', {
        title: 'Confirm your password to continue',
        params: { maxAgeSec },
      });
    }
    return true;
  }
}
