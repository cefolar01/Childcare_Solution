import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const PASSWORD_KEYLEN = 64;

/**
 * Resolve the app auth secret used for cookie signing material and field encryption.
 * Prefer AUTH_SECRET; fall back to a Dev-only default that must never be used in prod.
 */
export function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET (min 16 chars) is required in production');
  }
  return 'dev-only-auth-secret-change-me';
}

function deriveKey(secret, salt) {
  return scryptSync(secret, salt, 32, SCRYPT_PARAMS);
}

/** Hash a password with scrypt. Stored form: scrypt$saltHex$hashHex */
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, PASSWORD_KEYLEN, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = scryptSync(password, salt, expected.length, SCRYPT_PARAMS);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** AES-256-GCM encrypt a UTF-8 string. Output: v1:iv:tag:cipher (hex parts). */
export function encryptField(plaintext) {
  const salt = createHash('sha256').update('cc-field-v1').digest();
  const key = deriveKey(getAuthSecret(), salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptField(payload) {
  const parts = String(payload || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('invalid encrypted payload');
  }
  const salt = createHash('sha256').update('cc-field-v1').digest();
  const key = deriveKey(getAuthSecret(), salt);
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const data = Buffer.from(parts[3], 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}
