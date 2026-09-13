import { zBrandAssetUploadRequest, type BrandAssetUploadRequest } from '@carrental/contracts';
import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentActor } from '../../common/auth/auth.guard';
import { Permissions } from '../../common/auth/permissions.guard';
import type { Actor } from '../../common/auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

import { BrandAssetService } from './brand-asset.service';

/** DEC-025 — brand image uploads (logo / favicon / OG) that the theme config references. */
@ApiTags('config')
@Controller({ path: 'config', version: '1' })
export class BrandingController {
  constructor(private readonly brandAssets: BrandAssetService) {}

  @Post('branding/assets')
  @Permissions('config.publish')
  @ApiOperation({
    operationId: 'config_uploadBrandAsset',
    summary:
      'Upload a brand image (logo / favicon / OG) and get an obj: ref for the config (DEC-025)',
  })
  uploadBrandAsset(
    @Body(new ZodValidationPipe(zBrandAssetUploadRequest)) body: BrandAssetUploadRequest,
    @CurrentActor() actor: Actor,
  ) {
    return this.brandAssets.upload(body, actor);
  }
}
