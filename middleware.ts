import { NextRequest, NextResponse } from 'next/server';

const COOKIE = process.env.SESSION_COOKIE_NAME ?? 'sd_session';

export function middleware(request: NextRequest) {
  const hasCookie = request.cookies.get(COOKIE)?.value;
  if (!hasCookie) return NextResponse.redirect(new URL('/login', request.url));
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
