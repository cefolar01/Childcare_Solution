/**
 * Documented password strength rules for applicant accounts (WP-CC-AUTH-001).
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character from the allowed set
 */
export const PASSWORD_RULES_TEXT =
  'Password must be at least 12 characters and include uppercase, lowercase, a digit, and a special character (!@#$%^&*()_+-=[]{}|;:,.<>?). Passwords must be changed every 90 days.';

const SPECIAL = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/;

export function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 12) {
    return { ok: false, error: PASSWORD_RULES_TEXT };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, error: PASSWORD_RULES_TEXT };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, error: PASSWORD_RULES_TEXT };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, error: PASSWORD_RULES_TEXT };
  }
  if (!SPECIAL.test(password)) {
    return { ok: false, error: PASSWORD_RULES_TEXT };
  }
  return { ok: true };
}

/** Password aging policy: force reset every 90 days (Rich-confirmed). */
export const PASSWORD_MAX_AGE_DAYS = 90;

export function passwordNeedsReset(passwordChangedAt) {
  if (!passwordChangedAt) return true;
  const changed = new Date(passwordChangedAt).getTime();
  if (Number.isNaN(changed)) return true;
  const ageMs = Date.now() - changed;
  return ageMs >= PASSWORD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}
