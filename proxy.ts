import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'jarvis-session';

// Web Crypto HMAC — works in Edge runtime
async function makeToken(password: string): Promise<string> {
  const secret = process.env.SESSION_SECRET ?? 'jarvis-board-secret';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
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
  const { pathname } = req.nextUrl;

  // Always allow: login UI, auth API, healthcheck, static assets
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/health')
  ) {
    return NextResponse.next();
  }

  // Allow visitor comments (POST only — route handler enforces rate limit + validation)
  if (req.method === 'POST' && /^\/api\/posts\/[^/]+\/comments$/.test(pathname)) {
    return NextResponse.next();
  }

  // Agent API key bypass (write operations from Jarvis cron)
  if (pathname.startsWith('/api/')) {
    const agentKey = req.headers.get('x-agent-key');
    if (agentKey && agentKey === process.env.AGENT_API_KEY) {
      return NextResponse.next();
    }
  }

  // Viewer session cookie check
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const password = process.env.VIEWER_PASSWORD;

  if (password && session) {
    const expected = await makeToken(password);
    if (session === expected) {
      return NextResponse.next();
    }
  }

  // Unauthorized
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
