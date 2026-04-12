import { SESSION_COOKIE, GUEST_COOKIE } from './auth';

export interface RateLimitConfig {
  perMin: number;
  perDay: number;
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  remaining: { min: number; day: number };
  resetAt: { min: number; day: number };
}

interface Bucket {
  minuteBucket: number[];
  dayBucket: number[];
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const store: Map<string, Bucket> = new Map();

function prune(bucket: Bucket, now: number): void {
  const minCutoff = now - MINUTE_MS;
  const dayCutoff = now - DAY_MS;
  bucket.minuteBucket = bucket.minuteBucket.filter((t) => t > minCutoff);
  bucket.dayBucket = bucket.dayBucket.filter((t) => t > dayCutoff);
}

export function checkAndConsume(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  let bucket = store.get(key);
  if (!bucket) {
    bucket = { minuteBucket: [], dayBucket: [] };
    store.set(key, bucket);
  }
  prune(bucket, now);

  const minuteOldest = bucket.minuteBucket[0] ?? now;
  const dayOldest = bucket.dayBucket[0] ?? now;
  const resetAt = {
    min: minuteOldest + MINUTE_MS,
    day: dayOldest + DAY_MS,
  };

  if (bucket.minuteBucket.length >= config.perMin) {
    return {
      allowed: false,
      reason: `per-minute limit reached (${config.perMin}/min)`,
      remaining: {
        min: 0,
        day: Math.max(0, config.perDay - bucket.dayBucket.length),
      },
      resetAt,
    };
  }
  if (bucket.dayBucket.length >= config.perDay) {
    return {
      allowed: false,
      reason: `per-day limit reached (${config.perDay}/day)`,
      remaining: {
        min: Math.max(0, config.perMin - bucket.minuteBucket.length),
        day: 0,
      },
      resetAt,
    };
  }

  bucket.minuteBucket.push(now);
  bucket.dayBucket.push(now);

  return {
    allowed: true,
    remaining: {
      min: Math.max(0, config.perMin - bucket.minuteBucket.length),
      day: Math.max(0, config.perDay - bucket.dayBucket.length),
    },
    resetAt: {
      min: (bucket.minuteBucket[0] ?? now) + MINUTE_MS,
      day: (bucket.dayBucket[0] ?? now) + DAY_MS,
    },
  };
}

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const raw of parts) {
    const eq = raw.indexOf('=');
    if (eq === -1) continue;
    const k = raw.slice(0, eq).trim();
    if (k === name) {
      return raw.slice(eq + 1).trim();
    }
  }
  return undefined;
}

export function getKey(req: Request): string {
  const cookieHeader = req.headers.get('cookie');
  const session = readCookie(cookieHeader, SESSION_COOKIE);
  if (session) return `session:${session}`;
  const guest = readCookie(cookieHeader, GUEST_COOKIE);
  if (guest) return `guest:${guest}`;

  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return `ip:${first}`;
  }
  const xReal = req.headers.get('x-real-ip');
  if (xReal) return `ip:${xReal.trim()}`;

  return 'anon';
}
