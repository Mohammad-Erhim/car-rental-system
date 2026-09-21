import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AppError } from '../app-error';

import { RbacService } from './rbac.service';
import type { Actor } from './types';

export const PERMISSIONS = 'auth:permissions';
export const STAFF_PERMISSIONS = 'auth:staff-permissions';
export const ORG_WIDE = 'auth:org-wide';

/**
 * Marks an endpoint (or a whole controller) as covering the WHOLE organisation — settings,
 * audit log, payments configuration, reference data. It cannot be narrowed to a branch, so a
 * staff account limited to specific locations (`locationScope`) is refused rather than shown, or
 * allowed to change, organisation-wide data. Permissions still apply on top (SRS-SEC-007).
 */
export const OrgWide = () => SetMetadata(ORG_WIDE, true);

/**
 * Require one or more permission actions. `mode: 'all'` requires every listed action;
 * default 'any' requires at least one (SRS-SEC-007).
 */
export const Permissions = (...actions: string[]) =>
  SetMetadata(PERMISSIONS, { actions, mode: 'any' });
export const PermissionsAll = (...actions: string[]) =>
  SetMetadata(PERMISSIONS, { actions, mode: 'all' });

/**
 * For a route that serves BOTH audiences: a customer acting on their own record (the service
 * checks ownership) and staff acting on any record in their scope — `GET /reservations/:ref`,
 * `POST /reservations/:ref/cancel`, `POST /rentals/:ref/extend`, … A customer passes straight
 * through; a STAFF actor must hold at least one of `actions`, exactly as `@Permissions` demands on
 * the matching `/ops` route. Without it "is staff" alone was enough, so a role with no reservation
 * permission at all could read, cancel and refund any booking (DEC-038).
 */
export const StaffPermissions = (...actions: string[]) =>
  SetMetadata(STAFF_PERMISSIONS, { actions });

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
    const staffOnly = this.reflector.getAllAndOverride<{ actions: string[] } | undefined>(
      STAFF_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    const orgWide = this.reflector.getAllAndOverride<boolean>(ORG_WIDE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request & { actor?: Actor }>();
    const actor = req.actor;

    // dual-audience route (see `StaffPermissions`): customers fall through to the service's own
    // ownership check; a staff actor needs one of the listed actions.
    if (
      staffOnly?.actions.length &&
      actor?.kind === 'staff' &&
      !this.rbac.hasAny(actor, staffOnly.actions)
    ) {
      // Do not disclose which specific permission is missing.
      throw new AppError('forbidden', { title: 'You do not have permission to do this' });
    }

    const needsPermission = !!meta && meta.actions.length > 0;
    if (!needsPermission && !orgWide) return true;
    // location-scoped staff never reach organisation-wide areas (checked whenever an actor is
    // present — a public route on an @OrgWide controller has no actor and no permission to check)
    if (orgWide && actor?.kind === 'staff' && actor.locationScope?.length) {
      throw new AppError('forbidden', {
        title:
          'This area covers the whole organisation, so it needs an account that is not limited to specific locations',
      });
    }
    if (!needsPermission) return true;
    if (!actor) throw new AppError('auth_required');
    if (actor.kind !== 'staff') {
      throw new AppError('forbidden', { title: 'Staff permission required' });
    }

    const ok =
      meta!.mode === 'all'
        ? meta!.actions.every((a) => this.rbac.has(actor, a))
        : this.rbac.hasAny(actor, meta!.actions);

    if (!ok) {
      // Do not disclose which specific permission is missing.
      throw new AppError('forbidden', { title: 'You do not have permission to do this' });
    }
    return true;
  }
}
