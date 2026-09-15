import { deflateSync } from 'node:zlib';

import { DEFAULT_BRAND_CONFIG } from '@carrental/theme';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestApp, getTestApp, httpServer } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * SCREEN-OPS-041 — universal media library. `POST /ops/media` reuses the same base64-sniff-
 * sanitise pipeline as brand-asset uploads, but under a caller-chosen `purpose` rather than a
 * fixed asset kind, and every upload is browsable/deletable from one system-wide catalogue.
 * `remove()` refuses to delete a ref still pinned on a vehicle category or fleet unit.
 */

/** Minimal but byte-valid opaque PNG of the given size (IHDR + one IDAT + IEND, CRC32'd) —
 *  copied from brand-asset.spec.ts's own fixture builder. */
function makePng(width: number, height: number): Buffer {
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(height * (1 + width * 3));
  const idat = deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('media library', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let agentToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
  });
  afterAll(closeTestApp);

  it('upload → list → in-use guard → delete', async () => {
    const png = makePng(48, 48);
    const uploaded = await request(server)
      .post('/api/v1/ops/media')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        purpose: 'vehicle_category',
        dataBase64: png.toString('base64'),
        mediaType: 'image/png',
      })
      .expect(201);
    expect(uploaded.body.ref).toMatch(/^obj:vehicle_category\//);
    expect(uploaded.body.url).toMatch(/^\/api\/v1\/assets\/vehicle_category\/.+\?exp=\d+&sig=/);
    expect(uploaded.body.purpose).toBe('vehicle_category');

    const list = await request(server)
      .get('/api/v1/ops/media?purpose=vehicle_category')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.some((m: { id: string }) => m.id === uploaded.body.id)).toBe(true);

    // an agent (catalogue.read only, no *.manage) can browse but not upload or delete
    await request(server)
      .get('/api/v1/ops/media')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    await request(server)
      .post('/api/v1/ops/media')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        purpose: 'vehicle_category',
        dataBase64: png.toString('base64'),
        mediaType: 'image/png',
      })
      .expect(403);
    await request(server)
      .delete(`/api/v1/ops/media/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(403);

    // pin it to a category, then deletion must be refused
    const code = `test_media_cat_${Date.now()}`;
    await request(server)
      .post('/api/v1/ops/catalogue/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code,
        class: 'economy',
        displayName: 'Media Test Category',
        passengers: 4,
        luggage: 1,
        doors: 4,
        imageRef: uploaded.body.ref,
      })
      .expect(201);

    const blocked = await request(server)
      .delete(`/api/v1/ops/media/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(422);
    expect(blocked.body.title).toMatch(/still in use/i);

    // the public category view now resolves the pinned ref to a real signed image URL
    const publicView = await request(server)
      .get(`/api/v1/catalogue/categories/${code}`)
      .expect(200);
    expect(publicView.body.imageUrl).toMatch(
      /^\/api\/v1\/assets\/vehicle_category\/.+\?exp=\d+&sig=/,
    );

    // unpin it, then the delete succeeds
    await request(server)
      .post('/api/v1/ops/catalogue/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('If-Match', '1')
      .send({
        code,
        class: 'economy',
        displayName: 'Media Test Category',
        passengers: 4,
        luggage: 1,
        doors: 4,
      })
      .expect(201);
    await request(server)
      .delete(`/api/v1/ops/media/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const listAfter = await request(server)
      .get('/api/v1/ops/media?purpose=vehicle_category')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listAfter.body.some((m: { id: string }) => m.id === uploaded.body.id)).toBe(false);
  });

  it('refuses to delete an image pinned inside a branding config draft, not just a category/vehicle FK', async () => {
    // Branding (logo/favicon/OG image) and page-builder images go through this exact same
    // `stored_object` catalogue via `BrandAssetService`, but the ref just sits inside a
    // `config_version.payload` JSON blob — never a foreign key `whereUsed()` could see with the
    // category/unit checks alone. An actor with only catalogue.manage/fleet.manage (not
    // config.publish) has no visibility into config at all, so without this check they could
    // delete what looks unused here and silently break the live public site's logo.
    const png = makePng(48, 48);
    const uploaded = await request(server)
      .post('/api/v1/ops/media')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ purpose: 'branding', dataBase64: png.toString('base64'), mediaType: 'image/png' })
      .expect(201);

    const cfg = structuredClone(DEFAULT_BRAND_CONFIG);
    cfg.assets.logo = uploaded.body.ref;
    // still just a draft — not submitted/approved/published — proving "in use" isn't limited to
    // the live published revision (a delete must not also pull the rug out from under a draft
    // someone is about to publish).
    await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'branding', key: 'default', payload: cfg })
      .expect(201);

    const blocked = await request(server)
      .delete(`/api/v1/ops/media/${uploaded.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(422);
    expect(blocked.body.title).toMatch(/branding config/i);
  });

  it('rejects a file whose bytes do not match the declared media type', async () => {
    await request(server)
      .post('/api/v1/ops/media')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        purpose: 'vehicle_unit',
        dataBase64: Buffer.from('not an image').toString('base64'),
        mediaType: 'image/png',
      })
      .expect(422);
  });
});
