import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const start = Date.now();

  // Clone the response to capture status code
  const response = NextResponse.next();

  // Only log API requests
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const duration = Date.now() - start;

    // Log API request details in JSON format
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      endpoint: request.nextUrl.pathname,
      method: request.method,
      duration_ms: duration,
      // Note: Response status will be logged after response is sent
      // This is a limitation of Next.js middleware
    }));
  }

  return response;
}

export const config = {
  matcher: '/api/:path*'
};