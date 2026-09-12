import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

import { loadEnv } from '../../config/env.schema';

/**
 * At-rest encryption for secrets stored in the database (payment provider API keys — SRS-SEC-*).
 * AES-256-GCM: a fresh random IV per encryption, the auth tag caught on decrypt so a tampered or
 * corrupted ciphertext throws instead of silently returning garbage. The key itself never touches
 * the database — it's derived once from `PAYMENT_CONFIG_ENCRYPTION_KEY` (an operator secret, same
 * tier as `PASSWORD_PEPPER`/`COOKIE_SECRET`) via scrypt, so the stored key material doesn't need
 * to already be exactly 32 bytes.
 *
 * Ciphertext is serialized as `<iv>:<authTag>:<ciphertext>`, each base64url — one string column,
 * no extra columns needed to reconstruct it.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM's recommended nonce size

let cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = loadEnv().PAYMENT_CONFIG_ENCRYPTION_KEY;
  // a fixed, non-secret salt is fine here — scrypt's cost factor is what makes this slow to brute
  // force, and the "secret" being salted is itself already high-entropy operator config, not a
  // user password (SRS-SEC-005's per-user salting rules don't apply to this kind of secret).
  cachedKey = scryptSync(secret, 'carrental.payment-config.v1', 32);
  return cachedKey;
}

/** Exposed for tests that need to force a fresh key after changing `PAYMENT_CONFIG_ENCRYPTION_KEY`. */
export function resetSecretCipherCache(): void {
  cachedKey = null;
}

export function encryptSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString('base64url')).join(':');
}

export function decryptSecret(serialized: string): string {
  const parts = serialized.split(':');
  if (parts.length !== 3) throw new Error('malformed secret ciphertext');
  const [ivB64, tagB64, ctB64] = parts as [string, string, string];
  const key = deriveKey();
  const iv = Buffer.from(ivB64, 'base64url');
  const authTag = Buffer.from(tagB64, 'base64url');
  const ciphertext = Buffer.from(ctB64, 'base64url');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/** A safe-to-display fragment of a secret — enough for an operator to recognize *which* key is
 *  configured (e.g. to tell a test key from a live one) without ever reconstructing it. */
export function maskSecret(plaintext: string): string {
  const tail = plaintext.slice(-4);
  return `${'•'.repeat(Math.max(plaintext.length - 4, 4))}${tail}`;
}
