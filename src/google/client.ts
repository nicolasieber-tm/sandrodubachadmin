import { TOKEN_URL, googleOAuthConfig } from './config';
import { saveGoogleConnection, type GoogleConnection } from './tokens';

export type { GoogleConnection } from './tokens';

// Duenner Client gegen die Google Calendar API v3. Nutzt globalThis.fetch,
// damit Tests fetch mocken koennen. KEINE Abhaengigkeit auf das googleapis-SDK.

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

// Sicherheitsmarge: Tokens, die in weniger als 60s ablaufen, gelten als
// abgelaufen und werden vorsorglich erneuert.
const EXPIRY_SKEW_MS = 60_000;

/** Minimal getypte Google-Calendar-Event-Struktur (offen, da v3 viele Felder hat). */
export interface GoogleEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  [key: string]: unknown;
}

export interface GoogleEventList {
  items?: GoogleEvent[];
  [key: string]: unknown;
}

export interface GoogleCalendarListEntry {
  id: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string; // 'owner' | 'writer' | 'reader' | 'freeBusyReader'
  [key: string]: unknown;
}
export interface GoogleCalendarList {
  items?: GoogleCalendarListEntry[];
  [key: string]: unknown;
}

interface TokenRefreshResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

export class GoogleCalendarClient {
  /**
   * Liefert einen gueltigen Access-Token fuer die Verbindung. Ist der
   * gespeicherte Token abgelaufen (inkl. Sicherheitsmarge), wird er per
   * Refresh-Token erneuert und der neue Token+Ablauf persistiert.
   */
  async getValidAccessToken(conn: GoogleConnection): Promise<string> {
    const expiry = conn.row.tokenExpiry;
    const stillValid =
      expiry instanceof Date && expiry.getTime() - EXPIRY_SKEW_MS > Date.now();
    if (stillValid && conn.accessToken) {
      return conn.accessToken;
    }
    return this.refreshAccessToken(conn);
  }

  private async refreshAccessToken(conn: GoogleConnection): Promise<string> {
    // Ohne Refresh-Token ist keine Erneuerung moeglich – aussagekraeftig
    // werfen, statt bei Google in einen unklaren Fehler zu laufen.
    if (!conn.refreshToken) {
      throw new Error(
        'Keine Refresh-Token gespeichert — Google-Verbindung bitte erneut autorisieren.',
      );
    }
    const { clientId, clientSecret } = googleOAuthConfig();
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refreshToken,
    });

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google-Token-Refresh fehlgeschlagen (${res.status}): ${text}`);
    }
    const data = (await res.json()) as TokenRefreshResponse;
    const accessToken = data.access_token;
    if (!accessToken) {
      throw new Error('Google-Token-Refresh lieferte keinen access_token.');
    }
    const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    const expiry = new Date(Date.now() + expiresInSec * 1000);

    await saveGoogleConnection({
      accountLabel: conn.row.accountLabel,
      googleCalendarId: conn.row.googleCalendarId ?? '',
      accessToken,
      // Google liefert beim Refresh keinen neuen Refresh-Token: bestehenden behalten.
      refreshToken: conn.refreshToken,
      expiry,
      subCalendars: conn.row.subCalendars,
    });

    return accessToken;
  }

  private async request(
    accessToken: string,
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google Calendar API ${res.status}: ${text}`);
    }
    return res;
  }

  /** Listet Events eines Kalenders im Zeitfenster [timeMin, timeMax). */
  async listEvents(
    accessToken: string,
    calendarId: string,
    timeMinISO: string,
    timeMaxISO: string,
  ): Promise<GoogleEventList> {
    const params = new URLSearchParams({
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      singleEvents: 'true',
      orderBy: 'startTime',
    });
    const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
    const res = await this.request(accessToken, url, { method: 'GET' });
    return (await res.json()) as GoogleEventList;
  }

  /** Listet die Kalender des Kontos (CalendarList.list). */
  async listCalendars(accessToken: string): Promise<GoogleCalendarList> {
    const url = `${CALENDAR_API_BASE}/users/me/calendarList`;
    const res = await this.request(accessToken, url, { method: 'GET' });
    return (await res.json()) as GoogleCalendarList;
  }

  /** Legt ein Event im angegebenen Kalender an. */
  async insertEvent(
    accessToken: string,
    calendarId: string,
    event: GoogleEvent,
  ): Promise<GoogleEvent> {
    const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
    const res = await this.request(accessToken, url, {
      method: 'POST',
      body: JSON.stringify(event),
    });
    return (await res.json()) as GoogleEvent;
  }

  /** Aktualisiert ein bestehendes Event. */
  async updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    event: GoogleEvent,
  ): Promise<GoogleEvent> {
    const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const res = await this.request(accessToken, url, {
      method: 'PUT',
      body: JSON.stringify(event),
    });
    return (await res.json()) as GoogleEvent;
  }

  /** Loescht ein Event. */
  async deleteEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
  ): Promise<void> {
    const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    await this.request(accessToken, url, { method: 'DELETE' });
  }
}
