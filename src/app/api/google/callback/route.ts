import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { TOKEN_URL, googleOAuthConfig } from '@/google/config';
import { saveGoogleConnection } from '@/google/tokens';
import { env } from '@/env';

// OAuth-Callback: tauscht den Authorization-Code gegen Tokens, ermittelt
// E-Mail + Primaer-Kalender-ID und speichert die Verbindung verschluesselt.
// JEDER Fehler fuehrt zu einem Redirect auf ?google=fehler – es wird nichts
// geworfen.

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'g_oauth_state';
const PRIMARY_CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary';

interface TokenExchangeResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

interface PrimaryCalendar {
  id?: string;
  summary?: string;
}

// Weiterleitung gegen die oeffentliche APP_URL bauen (NICHT request.url):
// hinter dem Railway-Proxy ist request.url die interne Bind-Adresse
// (0.0.0.0:8080), was sonst zu einem kaputten Redirect fuehrt.
function redirectKalender(status: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/admin/kalender?google=${status}`, env.APP_URL),
  );
}

/**
 * Konstant-zeitiger Vergleich des OAuth-state (Query vs Cookie). Bei
 * Laengenungleichheit sofort Mismatch (timingSafeEqual wuerde sonst werfen).
 */
function stateMatches(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = request.nextUrl;
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const cookieState = request.cookies.get(STATE_COOKIE)?.value;

    // state pruefen (CSRF-Schutz). Mismatch oder fehlende Werte -> Fehler.
    // Vergleich konstant-zeitig, um Timing-Seitenkanaele zu vermeiden.
    if (!state || !cookieState || !stateMatches(state, cookieState)) {
      const res = redirectKalender('fehler');
      res.cookies.delete(STATE_COOKIE);
      return res;
    }
    if (!code) {
      const res = redirectKalender('fehler');
      res.cookies.delete(STATE_COOKIE);
      return res;
    }

    const { clientId, clientSecret, redirectUri } = googleOAuthConfig();

    // Code gegen Tokens tauschen.
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });
    if (!tokenRes.ok) {
      const res = redirectKalender('fehler');
      res.cookies.delete(STATE_COOKIE);
      return res;
    }
    const tokens = (await tokenRes.json()) as TokenExchangeResponse;
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    if (!accessToken || !refreshToken) {
      const res = redirectKalender('fehler');
      res.cookies.delete(STATE_COOKIE);
      return res;
    }
    const expiresInSec = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600;
    const expiry = new Date(Date.now() + expiresInSec * 1000);

    // E-Mail + Primaer-Kalender-ID ermitteln.
    const calRes = await fetch(PRIMARY_CALENDAR_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!calRes.ok) {
      const res = redirectKalender('fehler');
      res.cookies.delete(STATE_COOKIE);
      return res;
    }
    const primary = (await calRes.json()) as PrimaryCalendar;
    const calendarId = primary.id ?? 'primary';
    // Die Primaer-Kalender-ID entspricht bei Google der Account-E-Mail.
    const accountLabel = primary.id ?? primary.summary ?? 'Google-Konto';

    await saveGoogleConnection({
      accountLabel,
      googleCalendarId: calendarId,
      accessToken,
      refreshToken,
      expiry,
      subCalendars: [calendarId],
    });

    const res = redirectKalender('verbunden');
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch {
    const res = redirectKalender('fehler');
    res.cookies.delete(STATE_COOKIE);
    return res;
  }
}
