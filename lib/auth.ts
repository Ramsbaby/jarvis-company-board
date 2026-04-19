import { createHmac } from 'crypto';

export const SESSION_COOKIE = 'jarvis-session';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function makeToken(password: string): string {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error('SESSION_SECRET environment variable is required');
  return createHmac('sha256', sessionSecret).update(password).digest('hex');
}

export const GUEST_COOKIE = 'jarvis-guest';

/** Validate a guest token from a cookie against GUEST_TOKEN env var */
export function isValidGuestToken(cookieValue: string | undefined): boolean {
  // Fallback to 'public' when GUEST_TOKEN is not set — matches guest/route.ts behaviour
  const expected = process.env.GUEST_TOKEN ?? 'public';
  if (!cookieValue) return false;
  // Constant-time comparison to prevent timing attacks
  if (cookieValue.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= cookieValue.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Build a login redirect URL with a safely-encoded `next` parameter so the user
 * returns to the originally-requested path after authenticating.
 *
 * Only absolute, same-origin paths (starting with `/`) are allowed. Any other
 * value falls back to `/login` without a `next` parameter to prevent
 * open-redirect abuse.
 */
export function buildLoginRedirect(nextPath: string): string {
  if (!nextPath || typeof nextPath !== 'string') return '/login';
  // Reject protocol-relative URLs (e.g. "//evil.com") and anything that's not a
  // local path. `nextPath` must start with a single "/" and not be "//...".
  if (!nextPath.startsWith('/') || nextPath.startsWith('//')) return '/login';
  return `/login?next=${encodeURIComponent(nextPath)}`;
}
