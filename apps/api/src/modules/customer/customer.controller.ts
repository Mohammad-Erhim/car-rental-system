import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { CustomerMergeService } from './customer-merge.service';
import { CustomerRestrictionService } from './customer-restriction.service';
import { CustomerService } from './customer.service';

const zRestriction = z.object({
  category: z.enum(['review', 'block']),
  scope: z
    .string()
    .max(60)
    .regex(/^(all|category:[a-z0-9_-]+|location:[A-Za-z0-9_-]+)$/)
    .optional(),
  reasonCode: z.string().max(60).optional(),
  evidenceRef: z.string().max(500).optional(),
  effectiveFrom: z.string().datetime({ offset: true }).optional(),
  effectiveTo: z.string().datetime({ offset: true }).optional(),
});

const zDecision = z.object({ notes: z.string().max(1000).optional() });

const zMerge = z.object({
  intoId: z.string().uuid(),
  reason: z.string().max(1000).optional(),
});

/** SCREEN-OPS-021/022 · FR-ADM-001/002 — customer records (read) + eligibility restrictions. */
@ApiTags('admin')
@Controller({ path: 'ops', version: '1' })
export class CustomerController {
  constructor(
    private readonly customers: CustomerService,
    private readonly restrictions: CustomerRestrictionService,
    private readonly merges: CustomerMergeService,
  ) {}

  @Get('customers')
  @Permissions('customer.read')
  search(@Query('q') q = '', @CurrentActor() actor: Actor) {
    return this.customers.search(actor, q);
  }

  @Get('customers/:id')
  @Permissions('customer.read')
  detail(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.customers.detail(actor, id);
  }

  // --- eligibility restrictions (FR-ADM-002, write side) ---

  @Get('customers/:id/restrictions')
  @Permissions('customer.read')
  listRestrictions(@Param('id') id: string) {
    return this.restrictions.list(id);
  }

  @Post('customers/:id/restrictions')
  @Permissions('customer.manage')
  createRestriction(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(zRestriction)) body: z.infer<typeof zRestriction>,
    @CurrentActor() actor: Actor,
  ) {
    return this.restrictions.create(actor, id, body);
  }

  @Post('customers/:id/restrictions/:rid/approve')
  @Permissions('customer.manage')
  approveRestriction(
    @Param('id') id: string,
    @Param('rid') rid: string,
    @Body(new ZodValidationPipe(zDecision)) body: z.infer<typeof zDecision>,
    @CurrentActor() actor: Actor,
  ) {
    return this.restrictions.decide(actor, id, rid, 'approve', body.notes);
  }

  @Post('customers/:id/restrictions/:rid/reject')
  @Permissions('customer.manage')
  rejectRestriction(
    @Param('id') id: string,
    @Param('rid') rid: string,
    @Body(new ZodValidationPipe(zDecision)) body: z.infer<typeof zDecision>,
    @CurrentActor() actor: Actor,
  ) {
    return this.restrictions.decide(actor, id, rid, 'reject', body.notes);
  }

  @Post('customers/:id/restrictions/:rid/lift')
  @Permissions('customer.manage')
  liftRestriction(
    @Param('id') id: string,
    @Param('rid') rid: string,
    @Body(new ZodValidationPipe(zDecision)) body: z.infer<typeof zDecision>,
    @CurrentActor() actor: Actor,
  ) {
    return this.restrictions.lift(actor, id, rid, body.notes);
  }

  // --- duplicate review + reversible merge (FR-ADM-001) ---

  @Post('customers/:id/merge')
  @Permissions('customer.manage')
  merge(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(zMerge)) body: z.infer<typeof zMerge>,
    @CurrentActor() actor: Actor,
  ) {
    // :id is the duplicate that is folded into body.intoId (the survivor)
    return this.merges.merge(actor, body.intoId, id, body.reason);
  }

  @Post('customers/:id/unmerge')
  @Permissions('customer.manage')
  unmerge(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.merges.unmerge(actor, id);
  }
}
