import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { LocationAdminService } from './location-admin.service';

const zHoursSlot = z.object({
  day: z.number().int().min(0).max(6),
  open: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  close: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  closed: z.boolean().optional(),
});

const zLocation = z.object({
  code: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().min(1).max(120),
  timezone: z.string().min(3).max(64),
  address: z.record(z.string()).optional(),
  contact: z.record(z.string()).optional(),
  latitude: z.string().max(32).nullable().optional(),
  longitude: z.string().max(32).nullable().optional(),
  regularHours: z.array(zHoursSlot).max(7).optional(),
  afterHoursReturn: z.boolean().optional(),
  pickupInstructions: z.string().max(2000).nullable().optional(),
  returnInstructions: z.string().max(2000).nullable().optional(),
  supportedCategoryCodes: z.array(z.string().max(40)).max(50).optional(),
  turnaroundMinutes: z.number().int().min(0).max(1440).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

const zLegalProfile = z.object({
  legalName: z.string().min(1).max(200),
  taxId: z.string().min(1).max(60),
  registeredAddress: z.record(z.string()),
});

const zException = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  closed: z.boolean().optional(),
  open: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  close: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  reason: z.string().max(200).optional(),
});

/** SCREEN-OPS-028 / FR-ADM-007 — location & operating-hours administration. */
@ApiTags('ops-config')
@Controller({ path: 'ops', version: '1' })
export class LocationAdminController {
  constructor(private readonly locations: LocationAdminService) {}

  @Get('organization/legal')
  @Permissions('config.read', 'config.publish')
  getLegalProfile() {
    return this.locations.getLegalProfile();
  }

  @Post('organization/legal')
  @Permissions('config.publish')
  updateLegalProfile(
    @Body(new ZodValidationPipe(zLegalProfile)) body: z.infer<typeof zLegalProfile>,
    @CurrentActor() actor: Actor,
    @Req() req: Request,
  ) {
    const ifMatch = req.header('If-Match');
    return this.locations.updateLegalProfile(actor, body, ifMatch ? Number(ifMatch) : undefined);
  }

  @Get('locations')
  @Permissions('config.read', 'config.publish')
  list() {
    return this.locations.list();
  }

  @Get('locations/:code')
  @Permissions('config.read', 'config.publish')
  get(@Param('code') code: string) {
    return this.locations.get(code);
  }

  @Get('locations/:code/impact')
  @Permissions('config.read', 'config.publish')
  impact(@Param('code') code: string) {
    return this.locations.impact(code);
  }

  @Post('locations')
  @Permissions('config.publish')
  upsert(
    @Body(new ZodValidationPipe(zLocation)) body: z.infer<typeof zLocation>,
    @CurrentActor() actor: Actor,
  ) {
    return this.locations.upsert(actor, body);
  }

  @Post('locations/:code/archive')
  @Permissions('config.publish')
  archive(@Param('code') code: string, @Req() req: Request, @CurrentActor() actor: Actor) {
    return this.locations.setStatus(actor, code, 'archived', { force: req.query.force === 'true' });
  }

  @Post('locations/:code/restore')
  @Permissions('config.publish')
  restore(@Param('code') code: string, @CurrentActor() actor: Actor) {
    return this.locations.setStatus(actor, code, 'active');
  }

  @Post('locations/:code/hours-exceptions')
  @Permissions('config.publish')
  addException(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(zException)) body: z.infer<typeof zException>,
    @CurrentActor() actor: Actor,
  ) {
    return this.locations.addException(actor, code, body);
  }

  @Post('locations/:code/hours-exceptions/:id/remove')
  @Permissions('config.publish')
  removeException(
    @Param('code') code: string,
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.locations.removeException(actor, code, id);
  }
}
