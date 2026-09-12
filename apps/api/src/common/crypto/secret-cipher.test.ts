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
    // flip the ciphertext segment's last character
    const tail = parts[2]!;
    parts[2] = tail.slice(0, -1) + (tail.at(-1) === 'A' ? 'B' : 'A');
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
