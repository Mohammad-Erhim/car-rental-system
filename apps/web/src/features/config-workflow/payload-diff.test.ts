import { describe, expect, it } from 'vitest';

import { diffPayloads, flatten } from './payload-diff';

describe('payload-diff', () => {
  it('flattens nested objects and arrays to dotted paths', () => {
    expect(flatten({ a: { b: 1 }, c: [true, 'x'], d: null, e: {}, f: [] })).toEqual({
      'a.b': '1',
      'c[0]': 'true',
      'c[1]': 'x',
      d: 'null',
      e: '{}',
      f: '[]',
    });
  });

  it('lists only the fields that changed', () => {
    const changes = diffPayloads({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 }, d: 4 });
    expect(changes).toEqual([
      { path: 'b.c', before: '2', after: '3' },
      { path: 'd', before: undefined, after: '4' },
    ]);
  });

  it('shows every field as new when nothing was published before', () => {
    expect(diffPayloads(undefined, { a: 1 })).toEqual([
      { path: 'a', before: undefined, after: '1' },
    ]);
  });

  it('reports no change for equal payloads', () => {
    expect(diffPayloads({ a: 1 }, { a: 1 })).toEqual([]);
  });
});
