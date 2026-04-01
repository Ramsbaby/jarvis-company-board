export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { makeToken, SESSION_COOKIE, COOKIE_MAX_AGE } from '@/lib/auth';

// GET /api/auto-login
// 저장된 비밀번호로 세션 발급 (VIEWER_PASSWORD 검증).
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
    ?? req.headers.get('x-agent-key')
    ?? '';

  const password = process.env.VIEWER_PASSWORD;

  if (!password || key !== password) {
    return NextResponse.redirect(new URL('/login?error=1', req.url));
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
  return NextResponse.redirect(new URL(redirectTo, req.url));
}
