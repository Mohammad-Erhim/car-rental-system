import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
