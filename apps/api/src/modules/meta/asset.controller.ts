import { Controller, Get, Header, NotFoundException, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { Public } from '../../common/auth/decorators';
import { ObjectStorageService } from '../../common/object-storage/object-storage.service';

/**
 * Public, signed delivery of stored objects (brand assets today). The URL carries `exp` + `sig`
 * from {@link ObjectStorageService.signRef}; without a valid, unexpired signature the bytes are
 * never served. Immutable + long-cached once fetched (the key is content-addressed by nanoid).
 */
@ApiExcludeController()
@Public()
@Controller({ path: 'assets', version: '1' })
export class AssetController {
  constructor(private readonly storage: ObjectStorageService) {}

  @Get('*')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async get(
    @Req() req: Request,
    @Res() res: Response,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
  ) {
    // everything after `/assets/` is the object key (it contains slashes)
    const key = decodeURIComponent(req.path.replace(/^.*\/assets\//, ''));
    if (!key || !exp || !sig || !this.storage.verify(key, exp, sig)) {
      throw new NotFoundException();
    }
    const obj = await this.storage.read(key);
    if (!obj) throw new NotFoundException();
    res.setHeader('Content-Type', obj.mediaType);
    // SVGs are sanitised on upload; still forbid script execution if one is opened directly
    if (obj.mediaType === 'image/svg+xml') {
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    }
    res.end(obj.data);
  }
}
