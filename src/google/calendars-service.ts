import 'server-only';
import { isGoogleConfigured } from './config';
import { getGoogleConnection } from './tokens';
import { GoogleCalendarClient, type GoogleCalendarListEntry } from './client';

export interface CalendarOption {
  id: string;
  summary: string;
  primary: boolean;
  writable: boolean; // accessRole owner|writer
}

/** Laedt die Kalender des verbundenen Kontos. Bei Fehler/keine Verbindung: []. */
export async function getGoogleCalendars(): Promise<CalendarOption[]> {
  try {
    if (!isGoogleConfigured()) return [];
    const conn = await getGoogleConnection();
    if (!conn) return [];
    const client = new GoogleCalendarClient();
    const accessToken = await client.getValidAccessToken(conn);
    const list = await client.listCalendars(accessToken);
    return (list.items ?? []).map((c: GoogleCalendarListEntry) => ({
      id: c.id,
      summary: c.summary ?? c.id,
      primary: Boolean(c.primary),
      writable: c.accessRole === 'owner' || c.accessRole === 'writer',
    }));
  } catch (err) {
    console.warn('[google] getGoogleCalendars fehlgeschlagen:', err);
    return [];
  }
}
