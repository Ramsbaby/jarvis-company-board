import { NextRequest, NextResponse } from 'next/server';

const GUEST_COOKIE = 'jarvis-guest';

export async function GET(req: NextRequest) {
  // GUEST_TOKEN defaults to 'public' if not set — guest mode always works
  const guestToken = process.env.GUEST_TOKEN ?? 'public';

  // Use x-forwarded-host from reverse proxy — req.nextUrl.origin returns 0.0.0.0:3000
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host;
  const base  = `${proto}://${host}`;

  const res = NextResponse.redirect(`${base}/`);
  res.cookies.set(GUEST_COOKIE, guestToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}
