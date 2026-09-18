import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray } from 'drizzle-orm';

import { AppError } from '../../common/app-error';
import { AuditService } from '../../common/audit/audit.service';
import type { Actor } from '../../common/auth/types';
import {
  rasterDimensions,
  sanitizeSvg,
  sniffMediaType,
} from '../../common/object-storage/image.util';
import { ObjectStorageService } from '../../common/object-storage/object-storage.service';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { configVersion } from '../../database/schema/admin';
import { vehicleCategory } from '../../database/schema/catalogue';
import { vehicleUnit } from '../../database/schema/fleet';
import { storedObject } from '../../database/schema/platform';

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_PX = 16;
const MAX_PX = 4000;

export interface MediaItem {
  id: string;
  ref: string;
  url: string;
  purpose: string;
  ownerType: string;
  ownerId: string | null;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
}

/**
 * SCREEN-OPS-041 — universal media library, layered directly on the existing generic
 * `ObjectStorageService` + `stored_object` catalogue (DEC-015) rather than a new storage
 * mechanism: every image uploaded anywhere in the system (vehicle categories, fleet units, and
 * future purposes) lands in the same browsable, deletable catalogue. Branding's own uploads
 * (`BrandAssetService`) keep their dedicated validation/dimension rules per asset kind — this is
 * the general-purpose sibling for everything else.
 */
@Injectable()
export class MediaService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: ObjectStorageService,
    private readonly audit: AuditService,
  ) {}

  private toItem(r: typeof storedObject.$inferSelect): MediaItem {
    return {
      id: r.id,
      ref: `obj:${r.objectKey}`,
      url: this.storage.signRef(r.objectKey, 3600),
      purpose: r.purpose,
      ownerType: r.ownerType,
      ownerId: r.ownerId,
      mediaType: r.mediaType,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt,
    };
  }

  /** Not organization-scoped, unlike every other list endpoint in this area. `stored_object` (see
   *  `database/schema/platform.ts`) has no `organizationId` column at all — nothing to filter
   *  on — and the system is currently single-org throughout (`ConfigPublic.defaultOrganization()`
   *  picks the sole/first org; there's no per-request org selection anywhere in the API). Adding
   *  real scoping here means a schema migration (a new column, backfill, and deciding how
   *  media uploaded before multi-org existed gets attributed) — a bigger, cross-cutting call than
   *  this pass should make unilaterally for one module. Left as an explicit, disclosed gap rather
   *  than a half-fix; revisit if/when the system actually goes multi-org. */
  async list(filter: {
    purpose?: string;
    ownerType?: string;
    ownerId?: string;
  }): Promise<MediaItem[]> {
    const where = [
      filter.purpose ? eq(storedObject.purpose, filter.purpose) : undefined,
      filter.ownerType ? eq(storedObject.ownerType, filter.ownerType) : undefined,
      filter.ownerId ? eq(storedObject.ownerId, filter.ownerId) : undefined,
    ].filter(Boolean);
    const rows = await this.db
      .select()
      .from(storedObject)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(storedObject.createdAt))
      .limit(500);
    return rows.map((r) => this.toItem(r));
  }

  /**
   * The library page's view: one page of items (newest first) plus how many items each purpose
   * holds, so the page can offer a purpose filter without a second request. `list` stays the
   * unpaged read pickers use. Page size defaults to 24 (max 100).
   */
  async browse(filter: { purpose?: string; page?: number; pageSize?: number }) {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(page) || page < 1) {
      throw AppError.validation([{ path: 'page', code: 'too_small', params: { min: 1 } }]);
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw AppError.validation([{ path: 'pageSize', code: 'out_of_range' }]);
    }
    const where = filter.purpose ? eq(storedObject.purpose, filter.purpose) : undefined;
    const [rows, purposes] = await Promise.all([
      this.db
        .select()
        .from(storedObject)
        .where(where)
        .orderBy(desc(storedObject.createdAt), desc(storedObject.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ purpose: storedObject.purpose, n: count() })
        .from(storedObject)
        .groupBy(storedObject.purpose),
    ]);
    const purposeCounts = purposes
      .map((p) => ({ purpose: p.purpose, count: Number(p.n) }))
      .sort((a, b) => a.purpose.localeCompare(b.purpose));
    const total = filter.purpose
      ? (purposeCounts.find((p) => p.purpose === filter.purpose)?.count ?? 0)
      : purposeCounts.reduce((sum, p) => sum + p.count, 0);
    return {
      items: rows.map((r) => this.toItem(r)),
      page,
      pageSize,
      count: rows.length,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      purposeCounts,
    };
  }

  async upload(
    actor: Actor,
    input: {
      purpose: string;
      ownerType?: string;
      ownerId?: string;
      dataBase64: string;
      mediaType: string;
    },
  ): Promise<MediaItem> {
    const b64 = input.dataBase64.includes(',')
      ? input.dataBase64.slice(input.dataBase64.indexOf(',') + 1)
      : input.dataBase64;
    let data: Buffer;
    try {
      data = Buffer.from(b64, 'base64');
    } catch {
      throw AppError.validation([{ path: 'dataBase64', code: 'invalid' }], 'Not valid base64');
    }
    if (data.byteLength === 0) {
      throw AppError.validation([{ path: 'dataBase64', code: 'empty' }], 'Empty file');
    }
    if (data.byteLength > MAX_BYTES) {
      throw AppError.validation(
        [{ path: 'dataBase64', code: 'too_large' }],
        `File must be ≤ ${Math.round(MAX_BYTES / 1024 / 1024)} MB`,
      );
    }
    const sniffed = sniffMediaType(data);
    if (!sniffed) {
      throw AppError.validation(
        [{ path: 'mediaType', code: 'unsupported' }],
        'Unsupported or unrecognised image format — use PNG, JPEG, WebP or SVG',
      );
    }
    if (sniffed !== input.mediaType) {
      throw AppError.validation(
        [{ path: 'mediaType', code: 'mismatch' }],
        `File contents are ${sniffed}, not the declared ${input.mediaType}`,
      );
    }

    let out = data;
    if (sniffed === 'image/svg+xml') {
      try {
        out = Buffer.from(sanitizeSvg(data.toString('utf8')), 'utf8');
      } catch {
        throw AppError.validation(
          [{ path: 'dataBase64', code: 'invalid_svg' }],
          'Not a valid SVG document',
        );
      }
    } else {
      const dims = rasterDimensions(data, sniffed);
      if (!dims) {
        throw AppError.validation(
          [{ path: 'dataBase64', code: 'unreadable' }],
          'Could not read the image dimensions',
        );
      }
      const min = Math.min(dims.width, dims.height);
      const max = Math.max(dims.width, dims.height);
      if (min < MIN_PX || max > MAX_PX) {
        throw AppError.validation(
          [{ path: 'dataBase64', code: 'out_of_range' }],
          `Image dimensions must be between ${MIN_PX}px and ${MAX_PX}px`,
        );
      }
    }

    const stored = await this.storage.put({
      purpose: input.purpose,
      ownerType: input.ownerType ?? 'media_library',
      ownerId: input.ownerId ?? null,
      data: out,
      mediaType: sniffed,
    });
    await this.audit.record({
      action: 'media.uploaded',
      targetType: 'stored_object',
      targetId: stored.key,
      actor,
      after: { purpose: input.purpose, mediaType: sniffed, sizeBytes: stored.sizeBytes },
    });
    const [row] = await this.db
      .select()
      .from(storedObject)
      .where(eq(storedObject.objectKey, stored.key))
      .limit(1);
    return this.toItem(row!);
  }

  /** Every place in the system a ref could currently be pinned — checked before a delete so a
   *  still-used image can never silently vanish out from under a category or vehicle.
   *
   *  Branding (logo/favicon/OG image) and page-builder images go through this same `stored_object`
   *  catalogue (`BrandAssetService`) but aren't a foreign key anywhere — the ref just sits inside a
   *  `config_version.payload` JSON blob (`kind` 'branding' / 'pages'). An actor with only
   *  `catalogue.manage`/`fleet.manage` has no visibility into config at all, so without this check
   *  they could delete what looks unused here and silently break the live public site. Any
   *  non-terminal revision (draft/in_review/published) counts as "in use" — not just published —
   *  so a delete can't also pull the rug out from under a draft someone is about to publish. */
  private async whereUsed(ref: string): Promise<string[]> {
    const uses: string[] = [];
    const cats = await this.db
      .select({ code: vehicleCategory.code })
      .from(vehicleCategory)
      .where(eq(vehicleCategory.imageRef, ref));
    uses.push(...cats.map((c) => `vehicle category "${c.code}"`));
    const units = await this.db
      .select({ plate: vehicleUnit.plate })
      .from(vehicleUnit)
      .where(eq(vehicleUnit.imageRef, ref));
    uses.push(...units.map((u) => `vehicle "${u.plate}"`));

    const configRows = await this.db
      .select({ kind: configVersion.kind, key: configVersion.key, payload: configVersion.payload })
      .from(configVersion)
      .where(
        and(
          inArray(configVersion.kind, ['branding', 'pages']),
          inArray(configVersion.state, ['draft', 'in_review', 'published']),
        ),
      );
    for (const row of configRows) {
      if (!JSON.stringify(row.payload).includes(ref)) continue;
      uses.push(row.kind === 'branding' ? 'branding config' : `page-builder page "${row.key}"`);
    }

    return uses;
  }

  async remove(actor: Actor, id: string): Promise<void> {
    const [row] = await this.db.select().from(storedObject).where(eq(storedObject.id, id)).limit(1);
    if (!row) throw AppError.notFound('media item');
    const ref = `obj:${row.objectKey}`;
    const uses = await this.whereUsed(ref);
    if (uses.length) {
      throw AppError.businessRule(
        `Still in use by ${uses.slice(0, 3).join(', ')}${uses.length > 3 ? `, +${uses.length - 3} more` : ''} — remove it from there first`,
        { reason: 'in_use' },
      );
    }
    await this.storage.remove(row.objectKey);
    await this.audit.record({
      action: 'media.deleted',
      targetType: 'stored_object',
      targetId: row.objectKey,
      actor,
      before: { purpose: row.purpose, mediaType: row.mediaType },
    });
  }
}
