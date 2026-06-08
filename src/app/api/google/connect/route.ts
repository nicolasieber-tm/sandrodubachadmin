import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/auth/current-user';
import { isGoogleConfigured, googleOAuthConfig, AUTH_URL, SCOPES } from '@/google/config';
import { generateToken } from '@/lib/tokens';

// Startet den Google-OAuth-Flow: legt ein kurzlebiges state-Token als
// httpOnly-Cookie ab und leitet zur Google-Consent-Seite weiter.

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'g_oauth_state';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(
      new URL('/admin/kalender?google=nichtkonfiguriert', request.url),
    );
  }

  const { clientId, redirectUri } = googleOAuthConfig();
  const state = generateToken();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const consentUrl = `${AUTH_URL}?${params.toString()}`;
  const res = NextResponse.redirect(consentUrl);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 Minuten – nur fuer die Dauer des Flows.
  });
  return res;
}
