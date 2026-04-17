import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'jarvis-session';
const GUEST_COOKIE = 'jarvis-guest';

// ── Rate Limiter (Edge-compatible, in-memory) ──────────────────────
// 보안 감사 CRITICAL: /api/crons 쓰기 API에 DoS 방지용 rate limit 추가
const RL_WINDOW_MS = 60_000; // 1분
const RL_MAX_REQUESTS = 10; // 분당 최대 쓰기 요청

interface RateBucket {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateBucket>();

// 5분마다 만료된 엔트리 정리 (메모리 누수 방지)
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60_000;

function cleanupStaleEntries(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - RL_WINDOW_MS;
  for (const [key, bucket] of rateLimitStore) {
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
    if (bucket.timestamps.length === 0) rateLimitStore.delete(key);
  }
}

function getRateLimitKey(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return `rl:${first}`;
  }
  const xReal = req.headers.get('x-real-ip');
  if (xReal) return `rl:${xReal.trim()}`;
  return 'rl:unknown';
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  cleanupStaleEntries(now);

  let bucket = rateLimitStore.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    rateLimitStore.set(key, bucket);
  }

  const cutoff = now - RL_WINDOW_MS;
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= RL_MAX_REQUESTS) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.ceil((oldest + RL_WINDOW_MS - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.timestamps.push(now);
  return { allowed: true, remaining: RL_MAX_REQUESTS - bucket.timestamps.length, retryAfterSec: 0 };
}

const MUTATING_METHODS = new Set(['PATCH', 'POST', 'PUT', 'DELETE']);
// /api/game/chat은 자체 rate limiter 보유 → 중복 적용 제외
const RATE_LIMIT_EXCLUDE = ['/api/game/chat'];

// Web Crypto HMAC — works in Edge runtime
async function makeToken(password: string): Promise<string> {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error('SESSION_SECRET environment variable is required');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(sessionSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(password));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function proxy(req: NextRequest) {
  const start = Date.now();
  const url = req.nextUrl.clone();
  const { pathname } = url;

  // API 로깅을 위한 함수
  function logApiRequest(statusCode?: number) {
    if (pathname.startsWith('/api/')) {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        endpoint: pathname,
        method: req.method,
        status_code: statusCode || 200,
        duration_ms: Date.now() - start
      }));
    }
  }

  // Guest token in URL → set cookie, redirect (strip param)
  const guestParam = url.searchParams.get('guest');
  const guestToken = process.env.GUEST_TOKEN;
  if (guestParam && guestToken && guestParam === guestToken) {
    // (URL ?guest= flow requires explicit GUEST_TOKEN to prevent open access)
    url.searchParams.delete('guest');
    const res = NextResponse.redirect(url);
    res.cookies.set(GUEST_COOKIE, guestToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
    return res;
  }

  // /api/guest → set guest cookie and redirect home (handled here in Edge runtime,
  // not in the route handler, to avoid redirect+Set-Cookie instability in Next.js)
  if (pathname === '/api/guest') {
    const gt = guestToken ?? 'public';
    const homeUrl = new URL('/', req.url);
    const res = NextResponse.redirect(homeUrl);
    res.cookies.set(GUEST_COOKIE, gt, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
    return res;
  }

  // Always allow: login UI, auth API, healthcheck, guest login, static assets
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/guest')
  ) {
    logApiRequest(200);
    return NextResponse.next();
  }

  // Allow visitor comments (POST only — route handler enforces rate limit + validation)
  if (req.method === 'POST' && /^\/api\/posts\/[^/]+\/comments$/.test(pathname)) {
    logApiRequest(200);
    return NextResponse.next();
  }

  // ── Rate Limit: /api/crons 쓰기 API (PATCH/POST/PUT/DELETE) ──
  // 보안 감사 CRITICAL: DoS로 tasks.json 반복 수정 방지
  if (
    pathname.startsWith('/api/crons') &&
    MUTATING_METHODS.has(req.method) &&
    !RATE_LIMIT_EXCLUDE.some((p) => pathname.startsWith(p))
  ) {
    const rlKey = getRateLimitKey(req);
    const rl = checkRateLimit(rlKey);
    if (!rl.allowed) {
      logApiRequest(429);
      return NextResponse.json(
        {
          error: `요청이 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도하세요.`,
          retryAfterSec: rl.retryAfterSec,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfterSec) },
        },
      );
    }
  }

  // Agent API key bypass (write operations from Jarvis cron)
  if (pathname.startsWith('/api/')) {
    const agentKey = req.headers.get('x-agent-key');
    if (agentKey && agentKey === process.env.AGENT_API_KEY) {
      logApiRequest(200);
      return NextResponse.next();
    }
  }

  // Owner session check — must run BEFORE guest check so admins with both cookies pass through
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const password = process.env.VIEWER_PASSWORD;

  if (password && session) {
    const expected = await makeToken(password);
    if (session === expected) {
      logApiRequest(200);
      return NextResponse.next();
    }
  }

  // Allow guest cookie holders to pass (read-only access)
  // GUEST_TOKEN defaults to 'public' if not set — guest mode always works
  const effectiveGuestToken = guestToken ?? 'public';
  const guestCookie = req.cookies.get(GUEST_COOKIE)?.value;
  if (guestCookie && guestCookie === effectiveGuestToken) {
    // Owner-only surfaces: block for guests (redirect to login)
    // /company (자비스맵) = CEO's Bridge, /dev-tasks = 내부 운영 데이터
    const ownerOnlyPaths = ['/dev-tasks', '/company'];
    if (ownerOnlyPaths.some(p => pathname === p || pathname.startsWith(p + '/'))) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
    // Guest: allow all GET read-only routes; block write APIs
    if (!pathname.startsWith('/api/') || req.method === 'GET') {
      logApiRequest(200);
      return NextResponse.next();
    }
    // Block write operations for guests
    logApiRequest(403);
    return NextResponse.json({ error: 'Guests cannot write' }, { status: 403 });
  }

  // Unauthorized
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // sw.js, manifest.json, icon 파일은 PWA 필수 — 인증 미들웨어 제외
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|icon.*\\.png|icon\\.svg).*)'],
};
