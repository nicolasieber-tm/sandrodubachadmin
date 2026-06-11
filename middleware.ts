import { NextRequest, NextResponse } from 'next/server';
import { SESSION_TTL_SECONDS } from '@/lib/session-config';

const COOKIE = process.env.SESSION_COOKIE_NAME ?? 'sd_session';
const secure = process.env.NODE_ENV === 'production';

export function middleware(request: NextRequest) {
  const token = request.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.redirect(new URL('/login', request.url));

  // Rollierendes Cookie: bei jedem Admin-Aufruf das Ablaufdatum erneuern, damit
  // das Cookie nicht nach 30 Tagen verfaellt, solange der Nutzer aktiv ist. Die
  // eigentliche Gueltigkeit der Session prueft weiterhin der Data-Layer
  // (getCurrentUser -> validateSessionToken), der die DB-Session parallel verlaengert.
  const res = NextResponse.next();
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}

export const config = { matcher: ['/admin/:path*'] };
