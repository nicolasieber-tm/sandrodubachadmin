import 'server-only';
import type { Booking } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { isGoogleConfigured } from './config';
import { getGoogleConnection } from './tokens';
import { GoogleCalendarClient, type GoogleEvent } from './client';
import { setBookingGoogleEventId } from '@/bookings/repository';

// Layer 3: Synchronisation zwischen Buchungen und Google Calendar.
//
// Die REINEN Funktionen (buildEventPayload, eventsToBusyIntervals) sind frei
// von DB/Netz und damit direkt testbar. Die Service-Funktionen kapseln alle
// Seiteneffekte und werfen NIE: ist Google nicht konfiguriert oder verbunden,
// sind sie No-ops; bei Fehlern wird nur geloggt.

const ZONE = 'Europe/Zurich';

/** Zweistellige Zahl (z. B. 5 → '05'). */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Baut aus Datum 'YYYY-MM-DD', Zeit 'HH:MM' und einem Minuten-Offset eine
 * lokale ISO-Zeit 'YYYY-MM-DDTHH:MM:00' (ohne Zonen-Suffix – die Zone wird
 * separat im timeZone-Feld an Google uebergeben).
 */
function localDateTime(dateStr: string, timeStr: string, offsetMinutes = 0): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + offsetMinutes;
  // Tagesueberlauf sauber behandeln (z. B. Termin ab 23:30 + 60 Min).
  const dayShift = Math.floor(total / (24 * 60));
  const minutesInDay = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(minutesInDay / 60);
  const mm = minutesInDay % 60;

  const base = new Date(`${dateStr}T00:00:00`);
  base.setDate(base.getDate() + dayShift);
  const datePart = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
  return `${datePart}T${pad(hh)}:${pad(mm)}:00`;
}

/**
 * REINE Funktion: Wandelt eine Buchung in ein Google-Calendar-Event-Payload.
 *
 * - summary: Kundenname + ' — ' + Angebots-Snapshot.
 * - description: Kontaktangaben (E-Mail/Telefon) und ggf. Nachricht.
 * - Mit requestedTime: getakteter Termin (start/end als dateTime + timeZone),
 *   end = start + durationMinutes.
 * - Ohne requestedTime: Ganztags-Event (start/end als date).
 */
export function buildEventPayload(booking: Booking, durationMinutes = 60): GoogleEvent {
  const summary = `${booking.customerName} — ${booking.offerNameSnapshot}`;

  const lines: string[] = [];
  lines.push(`E-Mail: ${booking.customerEmail}`);
  if (booking.customerPhone) {
    lines.push(`Telefon: ${booking.customerPhone}`);
  }
  if (booking.message) {
    lines.push('');
    lines.push(booking.message);
  }
  const description = lines.join('\n');

  if (booking.requestedTime) {
    const start = localDateTime(booking.requestedDate, booking.requestedTime, 0);
    const end = localDateTime(booking.requestedDate, booking.requestedTime, durationMinutes);
    return {
      summary,
      description,
      start: { dateTime: start, timeZone: ZONE },
      end: { dateTime: end, timeZone: ZONE },
    };
  }

  // Ganztags: Google erwartet date-Werte (Ende exklusiv – hier derselbe Tag,
  // was Google als ganztaegiges Ein-Tages-Event interpretiert).
  return {
    summary,
    description,
    start: { date: booking.requestedDate },
    end: { date: booking.requestedDate },
  };
}

/**
 * REINE Funktion: Reduziert eine Google-Event-Liste auf die belegten
 * Intervalle eines bestimmten Tages 'YYYY-MM-DD'.
 *
 * - Ganztags-/date-Events werden uebersprungen (belegen keine Slot-Zeit).
 * - Nur dateTime-Events mit gueltigem Start/Ende am gesuchten Tag zaehlen.
 * - Das Ende wird auf den Tagesschluss begrenzt; Events, die nicht am Tag
 *   beginnen, werden ignoriert.
 */
export function eventsToBusyIntervals(
  events: GoogleEvent[],
  dateStr: string,
): { start: string; durationMinutes: number }[] {
  const result: { start: string; durationMinutes: number }[] = [];

  for (const ev of events) {
    const startRaw = ev.start?.dateTime;
    const endRaw = ev.end?.dateTime;
    // Ganztags-/date-Events oder unvollstaendige Zeiten ueberspringen.
    if (!startRaw || !endRaw) continue;

    const start = new Date(startRaw);
    const end = new Date(endRaw);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    const startDay = localDayString(start);
    if (startDay !== dateStr) continue; // Nur Events, die am gesuchten Tag beginnen.

    const startMinutes = start.getHours() * 60 + start.getMinutes();

    // Ende auf den Tagesschluss (24:00) begrenzen.
    let endMinutes: number;
    const endDay = localDayString(end);
    if (endDay !== dateStr) {
      endMinutes = 24 * 60;
    } else {
      endMinutes = end.getHours() * 60 + end.getMinutes();
    }

    const durationMinutes = endMinutes - startMinutes;
    if (durationMinutes <= 0) continue;

    result.push({ start: minutesToHHMM(startMinutes), durationMinutes });
  }

  return result;
}

/** Lokales Datum 'YYYY-MM-DD' eines Date-Objekts. */
function localDayString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Minuten seit Mitternacht → 'HH:MM'. */
function minutesToHHMM(total: number): string {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/**
 * Legt fuer eine Buchung ein Event im verbundenen Google-Kalender an und
 * speichert die zurueckgegebene Event-ID. No-op ohne Konfiguration/Verbindung.
 * Wirft NIE – Fehler werden ausschliesslich geloggt.
 */
export async function pushBookingToGoogle(booking: Booking): Promise<void> {
  try {
    if (!isGoogleConfigured()) return;
    const conn = await getGoogleConnection();
    if (!conn) return;
    const calendarId = conn.row.googleCalendarId;
    if (!calendarId) return;

    const client = new GoogleCalendarClient();
    const accessToken = await client.getValidAccessToken(conn);
    const payload = buildEventPayload(booking);
    const created = await client.insertEvent(accessToken, calendarId, payload);

    if (created.id) {
      await setBookingGoogleEventId(booking.id, created.id);
    }
  } catch (err) {
    console.warn('[google] pushBookingToGoogle fehlgeschlagen:', err);
    try {
      await logAudit({
        action: 'google.push.fehler',
        entity: 'booking',
        entityId: booking.id,
        meta: { message: err instanceof Error ? err.message : String(err) },
      });
    } catch {
      // Audit-Fehler bewusst verschlucken.
    }
  }
}

/**
 * Entfernt das zur Buchung gehoerende Google-Event (sofern eine Event-ID und
 * eine Verbindung vorhanden sind). Wirft NIE – Fehler werden nur geloggt.
 */
export async function removeBookingFromGoogle(booking: Booking): Promise<void> {
  try {
    if (!booking.googleEventId) return;
    if (!isGoogleConfigured()) return;
    const conn = await getGoogleConnection();
    if (!conn) return;
    const calendarId = conn.row.googleCalendarId;
    if (!calendarId) return;

    const client = new GoogleCalendarClient();
    const accessToken = await client.getValidAccessToken(conn);
    await client.deleteEvent(accessToken, calendarId, booking.googleEventId);
  } catch (err) {
    console.warn('[google] removeBookingFromGoogle fehlgeschlagen:', err);
    try {
      await logAudit({
        action: 'google.remove.fehler',
        entity: 'booking',
        entityId: booking.id,
        meta: { message: err instanceof Error ? err.message : String(err) },
      });
    } catch {
      // Audit-Fehler bewusst verschlucken.
    }
  }
}

/**
 * Liefert die durch Google-Events belegten Intervalle eines Tages, damit die
 * Slot-Berechnung sie als belegt beruecksichtigen kann. Ohne Konfiguration/
 * Verbindung oder bei Fehlern wird [] geliefert (wirft NIE).
 */
export async function googleBusyIntervals(
  dateStr: string,
): Promise<{ start: string; durationMinutes: number }[]> {
  try {
    if (!isGoogleConfigured()) return [];
    const conn = await getGoogleConnection();
    if (!conn) return [];
    const calendarId = conn.row.googleCalendarId;
    if (!calendarId) return [];

    const client = new GoogleCalendarClient();
    const accessToken = await client.getValidAccessToken(conn);

    const timeMin = new Date(`${dateStr}T00:00:00`).toISOString();
    const timeMax = new Date(`${dateStr}T23:59:59`).toISOString();
    const list = await client.listEvents(accessToken, calendarId, timeMin, timeMax);

    return eventsToBusyIntervals(list.items ?? [], dateStr);
  } catch (err) {
    console.warn('[google] googleBusyIntervals fehlgeschlagen:', err);
    return [];
  }
}
