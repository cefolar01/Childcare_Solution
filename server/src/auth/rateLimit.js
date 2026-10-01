/**
 * Simple in-memory rate limiter for auth anomalies (Dev MVP).
 * Documented rule: 5 failed attempts per key within a 15-minute window.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const buckets = new Map();

function prune(key, now) {
  const entry = buckets.get(key);
  if (!entry) return null;
  if (now - entry.startedAt > WINDOW_MS) {
    buckets.delete(key);
    return null;
  }
  return entry;
}

export function isRateLimited(key) {
  const now = Date.now();
  const entry = prune(key, now);
  return Boolean(entry && entry.count >= MAX_FAILURES);
}

export function recordFailure(key) {
  const now = Date.now();
  const entry = prune(key, now);
  if (!entry) {
    buckets.set(key, { count: 1, startedAt: now });
    return;
  }
  entry.count += 1;
}

export function clearFailures(key) {
  buckets.delete(key);
}

export function resetRateLimitState() {
  buckets.clear();
}

export const RATE_LIMIT_MESSAGE =
  'Too many failed attempts. Try again in 15 minutes.';
