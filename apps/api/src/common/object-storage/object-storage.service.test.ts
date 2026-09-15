import { describe, expect, it } from 'vitest';

import type { Env } from '../../config/env.schema';
import type { Database } from '../../database/drizzle';

import { ObjectStorageService } from './object-storage.service';

// Not a real Drizzle client — the constructor path under test throws before ever touching it.
const fakeDb = {} as Database;

function envWith(driver: 'fs' | 's3'): Env {
  return {
    OBJECT_STORAGE_DRIVER: driver,
    OBJECT_STORAGE_FS_ROOT: './var/objects',
    OBJECT_STORAGE_SIGNING_SECRET: 'x'.repeat(20),
  } as Env;
}

describe('ObjectStorageService', () => {
  it('boots normally with the implemented fs driver', () => {
    expect(() => new ObjectStorageService(fakeDb, envWith('fs'))).not.toThrow();
  });

  it('hard-fails at construction when OBJECT_STORAGE_DRIVER=s3 is selected (unimplemented — never silently falls back to the filesystem driver)', () => {
    expect(() => new ObjectStorageService(fakeDb, envWith('s3'))).toThrow(/not implemented/i);
  });
});
