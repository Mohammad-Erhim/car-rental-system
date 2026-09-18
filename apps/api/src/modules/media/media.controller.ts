import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { CurrentActor } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { MediaService } from './media.service';

const zUpload = z.object({
  purpose: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_]+$/, 'lowercase letters, digits, underscore'),
  ownerType: z.string().max(60).optional(),
  ownerId: z.string().max(120).optional(),
  dataBase64: z.string().min(1),
  mediaType: z.string().min(1).max(60),
});

/** SCREEN-OPS-041 — universal media library: browse/upload/delete every image used across the
 *  system in one place, on top of the existing generic object-storage catalogue. */
@ApiTags('ops-media')
@Controller({ path: 'ops/media', version: '1' })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  @Permissions('catalogue.read', 'fleet.read', 'config.read')
  list(
    @Query('purpose') purpose?: string,
    @Query('ownerType') ownerType?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.media.list({ purpose, ownerType, ownerId });
  }

  /** One page of the library plus per-purpose counts (the library page's view). */
  @Get('browse')
  @Permissions('catalogue.read', 'fleet.read', 'config.read')
  browse(
    @Query('purpose') purpose?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.media.browse({
      purpose: purpose || undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post()
  @Permissions('catalogue.manage', 'fleet.manage')
  upload(
    @Body(new ZodValidationPipe(zUpload)) body: z.infer<typeof zUpload>,
    @CurrentActor() actor: Actor,
  ) {
    return this.media.upload(actor, body);
  }

  @Delete(':id')
  @Permissions('catalogue.manage', 'fleet.manage')
  remove(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.media.remove(actor, id);
  }
}
