import { NextRequest, NextResponse } from 'next/server';

const GUEST_COOKIE = 'jarvis-guest';

export async function GET(req: NextRequest) {
  const guestToken = process.env.GUEST_TOKEN;
  const origin = req.nextUrl.origin;

  if (!guestToken) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const res = NextResponse.redirect(`${origin}/`);
  res.cookies.set(GUEST_COOKIE, guestToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}
