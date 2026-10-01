import { Secret, TOTP } from 'otpauth';

const ISSUER = 'Childcare Solution';

export function generateTotpSecret() {
  const secret = new Secret({ size: 20 });
  return secret.base32;
}

export function buildOtpauthUri(email, secretBase32) {
  const totp = new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  return totp.toString();
}

export function verifyTotpCode(secretBase32, code) {
  const cleaned = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const totp = new TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  // Allow ±1 step for clock skew
  const delta = totp.validate({ token: cleaned, window: 1 });
  return delta !== null;
}

/** Generate a current TOTP code (tests only). */
export function currentTotpCode(secretBase32) {
  const totp = new TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  return totp.generate();
}
