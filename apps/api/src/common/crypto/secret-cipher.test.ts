import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.schema', () => ({
  loadEnv: () => ({ PAYMENT_CONFIG_ENCRYPTION_KEY: 'test-only-encryption-key-not-real' }),
}));

import { decryptSecret, encryptSecret, maskSecret, resetSecretCipherCache } from './secret-cipher';

describe('secret-cipher', () => {
  beforeEach(() => resetSecretCipherCache());

  it('round-trips a secret through encrypt/decrypt', () => {
    const plaintext = 'sk_test_abcdef1234567890';
    const ciphertext = encryptSecret(plaintext);
    expect(ciphertext).not.toContain(plaintext);
    expect(decryptSecret(ciphertext)).toBe(plaintext);
  });

  it('two encryptions of the same plaintext produce different ciphertext (random IV)', () => {
    const a = encryptSecret('sk_test_same_value');
    const b = encryptSecret('sk_test_same_value');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('sk_test_same_value');
    expect(decryptSecret(b)).toBe('sk_test_same_value');
  });

  it('a tampered ciphertext fails to decrypt instead of returning garbage (GCM auth tag)', () => {
    const ciphertext = encryptSecret('sk_test_important_value');
    const parts = ciphertext.split(':');
    // Flip the ciphertext segment's FIRST character, not its last: base64url has no padding
    // character, so when the encoded byte length isn't a multiple of 3 the final character's
    // low bits are unused filler the decoder ignores — flipping between two symbols that differ
    // only in those filler bits (e.g. 'A'/'B', which differ only in their lowest bit) can decode
    // to the exact same byte, making the "tamper" a no-op some of the time. The first character
    // sits in a full 3-byte/4-character group with no filler bits, so any change there always
    // changes real ciphertext bytes.
    const head = parts[2]!;
    parts[2] = (head.at(0) === 'A' ? 'B' : 'A') + head.slice(1);
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('a malformed serialization throws rather than silently producing a wrong value', () => {
    expect(() => decryptSecret('not-a-valid-ciphertext')).toThrow(/malformed/);
  });

  it('maskSecret keeps only the last 4 characters visible', () => {
    const masked = maskSecret('sk_test_51H8xyz9876543210');
    expect(masked.endsWith('3210')).toBe(true);
    expect(masked).not.toContain('sk_test_51H8xyz');
  });
});
