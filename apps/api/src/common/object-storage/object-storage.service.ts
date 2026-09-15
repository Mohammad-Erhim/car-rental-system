import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/drizzle';
import { storedObject } from '../../database/schema/platform';

export interface PutInput {
  purpose: string;
  ownerType: string;
  ownerId?: string | null;
  data: Buffer;
  mediaType: string;
}

export interface StoredRef {
  /** `obj:<key>` — what config payloads persist; resolved to a signed URL for clients. */
  ref: string;
  key: string;
  sizeBytes: number;
  checksumSha256: string;
}

/**
 * Object storage port + local filesystem driver (DEC-015). Content lives under
 * `OBJECT_STORAGE_FS_ROOT`; `stored_object` holds the metadata. Reads are handed out as
 * short-lived HMAC-signed URLs (`GET /api/v1/assets/:key?exp&sig`), never a raw path.
 * The S3 adapter is a future swap behind the same methods.
 */
@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger('ObjectStorageService');
  private readonly root: string;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {
    // OBJECT_STORAGE_DRIVER=s3 validates in env.schema.ts (DEC-015 names it as the future
    // adapter) but has no implementation here — every method below unconditionally uses the
    // local filesystem regardless of this setting. Silently falling back to `fs` in that case
    // would be a data-durability trap on a multi-instance or ephemeral-disk deployment (brand
    // assets/receipts/exports vanish on restart/scale) with no signal until something goes
    // missing. Fail loud at boot instead — the app must not start half-configured this way.
    if (this.env.OBJECT_STORAGE_DRIVER === 's3') {
      throw new Error(
        'OBJECT_STORAGE_DRIVER=s3 is configured but not implemented — ObjectStorageService only ' +
          'has a filesystem driver. Set OBJECT_STORAGE_DRIVER=fs, or implement the s3 driver ' +
          'before selecting it.',
      );
    }
    this.root = resolve(this.env.OBJECT_STORAGE_FS_ROOT);
  }

  async put(input: PutInput): Promise<StoredRef> {
    const key = `${input.purpose}/${new Date().getFullYear()}/${nanoid(24)}`;
    const checksumSha256 = createHash('sha256').update(input.data).digest('hex');
    const abs = join(this.root, key);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, input.data);

    await this.db.insert(storedObject).values({
      purpose: input.purpose,
      ownerType: input.ownerType,
      ownerId: input.ownerId ?? null,
      objectKey: key,
      mediaType: input.mediaType,
      sizeBytes: input.data.byteLength,
      checksumSha256,
      scanState: 'clean', // local driver: no external scanner; SVG is sanitised at the edge
      reviewState: 'none',
      uploadComplete: 'yes',
    });

    this.logger.log(
      { key, mediaType: input.mediaType, sizeBytes: input.data.byteLength },
      'stored object',
    );
    return { ref: `obj:${key}`, key, sizeBytes: input.data.byteLength, checksumSha256 };
  }

  /** Permanently remove an object's catalogue row and its bytes on disk. Idempotent — a missing
   *  file (already gone) is not an error, only surfaced via a debug log. */
  async remove(key: string): Promise<void> {
    await this.db.delete(storedObject).where(eq(storedObject.objectKey, key));
    try {
      await rm(join(this.root, key), { force: true });
    } catch (err) {
      this.logger.warn({ key, err }, 'could not remove object file (catalogue row still deleted)');
    }
  }

  /** Read an object by key with its media type, or `null` if it isn't in the catalogue. */
  async read(key: string): Promise<{ data: Buffer; mediaType: string } | null> {
    const [row] = await this.db
      .select({ mediaType: storedObject.mediaType })
      .from(storedObject)
      .where(eq(storedObject.objectKey, key))
      .limit(1);
    if (!row) return null;
    try {
      const data = await readFile(join(this.root, key));
      return { data, mediaType: row.mediaType };
    } catch {
      return null;
    }
  }

  /** `obj:<key>` / bare key → a signed, time-limited URL under `/api/v1/assets/`. */
  signRef(refOrKey: string, ttlSeconds = 3600): string {
    const key = refOrKey.startsWith('obj:') ? refOrKey.slice(4) : refOrKey;
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = this.sign(key, exp);
    return `/api/v1/assets/${key}?exp=${exp}&sig=${sig}`;
  }

  verify(key: string, exp: string | number, sig: string): boolean {
    const expNum = Number(exp);
    if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return false;
    const expected = this.sign(key, expNum);
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private sign(key: string, exp: number): string {
    return createHmac('sha256', this.env.OBJECT_STORAGE_SIGNING_SECRET)
      .update(`${key}\n${exp}`)
      .digest('base64url');
  }
}
