import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
// scrypt cost. N=2^15 keeps a single hash around ~100ms on server hardware,
// which is the point: it makes offline guessing expensive.
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS).toString('hex');
  return { hash, salt };
}

/** Compares in constant time so a wrong password can't be timed character by character. */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
