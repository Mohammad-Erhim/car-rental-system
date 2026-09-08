import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AppError } from '../app-error';

import { RbacService } from './rbac.service';
import type { Actor } from './types';

export const PERMISSIONS = 'auth:permissions';

/**
 * Require one or more permission actions. `mode: 'all'` requires every listed action;
 * default 'any' requires at least one (SRS-SEC-007).
 */
export const Permissions = (...actions: string[]) =>
  SetMetadata(PERMISSIONS, { actions, mode: 'any' });
export const PermissionsAll = (...actions: string[]) =>
  SetMetadata(PERMISSIONS, { actions, mode: 'all' });

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<{ actions: string[]; mode: 'any' | 'all' }>(
      PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!meta || !meta.actions.length) return true;

    const req = context.switchToHttp().getRequest<Request & { actor?: Actor }>();
    const actor = req.actor;
    if (!actor) throw new AppError('auth_required');
    if (actor.kind !== 'staff') {
      throw new AppError('forbidden', { title: 'Staff permission required' });
    }

    const ok =
      meta.mode === 'all'
        ? meta.actions.every((a) => this.rbac.has(actor, a))
        : this.rbac.hasAny(actor, meta.actions);

    if (!ok) {
      // Do not disclose which specific permission is missing.
      throw new AppError('forbidden', { title: 'You do not have permission to do this' });
    }
    return true;
  }
}
