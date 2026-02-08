import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Emergency kill switch (set to true to block ALL API access)
const EMERGENCY_SHUTDOWN = false;

// Paths that require additional security
const API_PATHS = ['/api/agents/', '/api/world/'];

export function middleware(request: NextRequest) {
  // Emergency shutdown check
  if (EMERGENCY_SHUTDOWN && API_PATHS.some(path => request.nextUrl.pathname.startsWith(path))) {
    return NextResponse.json(
      { error: 'Realm is temporarily offline for maintenance' },
      { status: 503 }
    );
  }
  
  // Add security headers to all responses
  const response = NextResponse.next();
  
  // Prevent XSS
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy (restrict camera, microphone, etc.)
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );
  
  // CSP for API routes (stricter)
  if (API_PATHS.some(path => request.nextUrl.pathname.startsWith(path))) {
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'"
    );
  }
  
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/world/:path*',
    '/((?!_next/static|_next/image|favicon.ico|manifest.json).*)'
  ]
};
