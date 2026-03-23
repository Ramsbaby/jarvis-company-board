import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Only process API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const start = Date.now();

    // Log the incoming request
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      endpoint: request.nextUrl.pathname,
      method: request.method,
      duration_ms: Date.now() - start
    }));

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*'
};