import { NextResponse, type NextRequest } from 'next/server';
import { TOKEN_URL, googleOAuthConfig } from '@/google/config';
import { saveGoogleConnection } from '@/google/tokens';

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

function redirectKalender(request: NextRequest, status: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/admin/kalender?google=${status}`, request.url),
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = request.nextUrl;
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const cookieState = request.cookies.get(STATE_COOKIE)?.value;

    // state pruefen (CSRF-Schutz). Mismatch oder fehlende Werte -> Fehler.
    if (!state || !cookieState || state !== cookieState) {
      const res = redirectKalender(request, 'fehler');
      res.cookies.delete(STATE_COOKIE);
      return res;
    }
    if (!code) {
      const res = redirectKalender(request, 'fehler');
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
      const res = redirectKalender(request, 'fehler');
      res.cookies.delete(STATE_COOKIE);
      return res;
    }
    const tokens = (await tokenRes.json()) as TokenExchangeResponse;
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    if (!accessToken || !refreshToken) {
      const res = redirectKalender(request, 'fehler');
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
      const res = redirectKalender(request, 'fehler');
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

    const res = redirectKalender(request, 'verbunden');
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch {
    const res = redirectKalender(request, 'fehler');
    res.cookies.delete(STATE_COOKIE);
    return res;
  }
}
