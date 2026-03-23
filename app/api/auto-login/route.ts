export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { makeToken, SESSION_COOKIE, COOKIE_MAX_AGE } from '@/lib/auth';

// GET /api/auto-login
// 저장된 비밀번호로 세션 발급 (VIEWER_PASSWORD 검증).
export async function GET(req: NextRequest) {
  // Railway 등 리버스 프록시 뒤에서는 req.url이 내부 주소(0.0.0.0:3000)이므로
  // x-forwarded-host / x-forwarded-proto 헤더에서 실제 public origin 구성
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000';
  const origin = `${proto}://${host}`;

  const key = req.nextUrl.searchParams.get('key')
    ?? req.headers.get('x-agent-key')
    ?? '';

  const password = process.env.VIEWER_PASSWORD;

  if (!password || key !== password) {
    return NextResponse.redirect(new URL('/login?error=1', origin));
  }

  const token = makeToken(password);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  const redirectTo = req.nextUrl.searchParams.get('next') ?? '/';
  return NextResponse.redirect(new URL(redirectTo, origin));
}
