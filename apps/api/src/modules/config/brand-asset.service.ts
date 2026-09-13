import {
  ERROR_CODE,
  type BrandAssetUploadRequest,
  type BrandAssetUploadResponse,
} from '@carrental/contracts';
import { Injectable } from '@nestjs/common';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import {
  rasterDimensions,
  sanitizeSvg,
  sniffMediaType,
} from '../../common/object-storage/image.util';
import { ObjectStorageService } from '../../common/object-storage/object-storage.service';

/** Per-purpose byte caps and dimension bounds for brand images (STAGE-009, DEC-025). */
const LIMITS: Record<
  BrandAssetUploadRequest['purpose'],
  { maxBytes: number; minPx: number; maxPx: number }
> = {
  logo: { maxBytes: 512 * 1024, minPx: 16, maxPx: 2000 },
  logoDark: { maxBytes: 512 * 1024, minPx: 16, maxPx: 2000 },
  favicon: { maxBytes: 128 * 1024, minPx: 16, maxPx: 512 },
  ogImage: { maxBytes: 2 * 1024 * 1024, minPx: 200, maxPx: 2400 },
  // page-builder images (raster-only, enforced below like ogImage)
  heroImage: { maxBytes: 3 * 1024 * 1024, minPx: 640, maxPx: 3840 },
  pageImage: { maxBytes: 1.5 * 1024 * 1024, minPx: 120, maxPx: 2600 },
};

@Injectable()
export class BrandAssetService {
  constructor(
    private readonly storage: ObjectStorageService,
    private readonly audit: AuditService,
  ) {}

  async upload(input: BrandAssetUploadRequest, actor: Actor): Promise<BrandAssetUploadResponse> {
    const limit = LIMITS[input.purpose];

    const b64 = input.dataBase64.includes(',')
      ? input.dataBase64.slice(input.dataBase64.indexOf(',') + 1)
      : input.dataBase64;
    let data: Buffer;
    try {
      data = Buffer.from(b64, 'base64');
    } catch {
      throw new AppError(ERROR_CODE.VALIDATION_FAILED, { title: 'dataBase64 is not valid base64' });
    }
    if (data.byteLength === 0) {
      throw new AppError(ERROR_CODE.VALIDATION_FAILED, { title: 'Empty file' });
    }
    if (data.byteLength > limit.maxBytes) {
      throw new AppError(ERROR_CODE.VALIDATION_FAILED, {
        title: `${input.purpose} must be ≤ ${Math.round(limit.maxBytes / 1024)} KB`,
      });
    }

    const sniffed = sniffMediaType(data);
    if (!sniffed) {
      throw new AppError(ERROR_CODE.VALIDATION_FAILED, {
        title: 'Unsupported or unrecognised image format',
      });
    }
    if (sniffed !== input.mediaType) {
      throw new AppError(ERROR_CODE.VALIDATION_FAILED, {
        title: `File contents are ${sniffed}, not the declared ${input.mediaType}`,
      });
    }
    // favicons only from ico / png; OG images never SVG (poor social-card support)
    if (input.purpose === 'favicon' && !['image/x-icon', 'image/png'].includes(sniffed)) {
      throw new AppError(ERROR_CODE.VALIDATION_FAILED, {
        title: 'A favicon must be a .ico or .png',
      });
    }
    if (
      ['ogImage', 'heroImage', 'pageImage'].includes(input.purpose) &&
      sniffed === 'image/svg+xml'
    ) {
      throw new AppError(ERROR_CODE.VALIDATION_FAILED, {
        title: `A ${input.purpose} must be a raster format (PNG / JPEG / WebP)`,
      });
    }

    const mediaType: string = sniffed;
    let out = data;
    let width: number | null = null;
    let height: number | null = null;

    if (sniffed === 'image/svg+xml') {
      let cleaned: string;
      try {
        cleaned = sanitizeSvg(data.toString('utf8'));
      } catch {
        throw new AppError(ERROR_CODE.VALIDATION_FAILED, { title: 'Not a valid SVG document' });
      }
      out = Buffer.from(cleaned, 'utf8');
    } else {
      const dims = rasterDimensions(data, sniffed);
      if (!dims) {
        throw new AppError(ERROR_CODE.VALIDATION_FAILED, {
          title: 'Could not read the image dimensions',
        });
      }
      width = dims.width;
      height = dims.height;
      const min = Math.min(dims.width, dims.height);
      const max = Math.max(dims.width, dims.height);
      if (min < limit.minPx || max > limit.maxPx) {
        throw new AppError(ERROR_CODE.VALIDATION_FAILED, {
          title: `${input.purpose} dimensions must be between ${limit.minPx}px and ${limit.maxPx}px`,
        });
      }
    }

    const stored = await this.storage.put({
      purpose: `brand_${input.purpose}`,
      ownerType: 'branding',
      ownerId: 'default',
      data: out,
      mediaType,
    });

    // Every other admin write path in this module records itself — logo/favicon/OG uploads were
    // the one silent gap, invisible in the audit trail even though they're config.publish-gated.
    await this.audit.record({
      action: 'config.branding.asset_uploaded',
      targetType: 'brand_asset',
      targetId: stored.ref,
      actor,
      after: { purpose: input.purpose, mediaType, sizeBytes: stored.sizeBytes, width, height },
    });

    return {
      ref: stored.ref,
      url: this.storage.signRef(stored.ref, 3600),
      mediaType,
      sizeBytes: stored.sizeBytes,
      width,
      height,
    };
  }
}
