import 'server-only';
import type { Booking } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { isGoogleConfigured } from './config';
import { getGoogleConnection } from './tokens';
import { GoogleCalendarClient, type GoogleEvent } from './client';
import { setBookingGoogleSync, clearBookingGoogleSync } from '@/bookings/repository';
import { getOffer } from '@/offers/repository';
import { mergeBusyIntervals, resolveTargetCalendar } from './calendar-logic';

// Layer 3: Synchronisation zwischen Buchungen und Google Calendar.
//
// Die REINEN Funktionen (buildEventPayload, eventsToBusyIntervals) sind frei
// von DB/Netz und damit direkt testbar. Die Service-Funktionen kapseln alle
// Seiteneffekte und werfen NIE: ist Google nicht konfiguriert oder verbunden,
// sind sie No-ops; bei Fehlern wird nur geloggt.

const ZONE = 'Europe/Zurich';

/**
 * Offset der Zone ZONE relativ zu UTC in Minuten fuer einen konkreten Instant
 * (positiv = oestlich von UTC). TZ-fest via Intl, unabhaengig von der Server-TZ.
 */
function zoneOffsetMinutes(date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/**
 * Wandzeit (Kalendertag + Minuten ab Mitternacht) eines Instants in der Zone
 * ZONE. TZ-fest via Intl, unabhaengig von der Server-TZ.
 */
function zurichWallClock(date: Date): { date: string; minutes: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}

/**
 * UTC-ISO-Grenzen des Zuercher Kalendertags dateStr ('YYYY-MM-DD'):
 * timeMin = 00:00 Zuercher Zeit, timeMax = +24h. TZ-fest, server-unabhaengig.
 */
function zurichDayRangeIso(dateStr: string): { timeMin: string; timeMax: string } {
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const offMin = zoneOffsetMinutes(guess);
  const startUtc = new Date(guess.getTime() - offMin * 60000);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60000);
  return { timeMin: startUtc.toISOString(), timeMax: endUtc.toISOString() };
}

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
  // Ohne Datum gibt es kein Event (Anfragen ohne Termin). Die Service-Schicht
  // (pushBookingToGoogle) prueft das vorab; hier ist der Wurf nur die letzte
  // Verteidigung und wird vom dortigen try/catch aufgefangen.
  const dateStr = booking.requestedDate;
  if (!dateStr) {
    throw new Error('Buchung ohne Datum kann nicht synchronisiert werden.');
  }

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
    const start = localDateTime(dateStr, booking.requestedTime, 0);
    const end = localDateTime(dateStr, booking.requestedTime, durationMinutes);
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
    start: { date: dateStr },
    end: { date: dateStr },
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

    // Wandzeit explizit gegen Europe/Zurich ableiten (server-TZ-unabhaengig).
    const startWall = zurichWallClock(start);
    if (startWall.date !== dateStr) continue; // Nur Events, die am gesuchten Tag beginnen.

    const startMinutes = startWall.minutes;

    // Ende auf den Tagesschluss (24:00) begrenzen, wenn es auf einen Folgetag faellt.
    const endWall = zurichWallClock(end);
    const endMinutes = endWall.date !== dateStr ? 24 * 60 : endWall.minutes;

    const durationMinutes = endMinutes - startMinutes;
    if (durationMinutes <= 0) continue;

    result.push({ start: minutesToHHMM(startMinutes), durationMinutes });
  }

  return result;
}

/** Minuten seit Mitternacht → 'HH:MM'. */
function minutesToHHMM(total: number): string {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/**
 * Legt fuer eine Buchung ein Event im Zielkalender an (oder aktualisiert es).
 * Liegt ein Event bereits im falschen Kalender, wird es dort zuvor geloescht.
 * No-op ohne Konfiguration/Verbindung. Wirft NIE – Fehler werden nur geloggt.
 */
export async function pushBookingToGoogle(booking: Booking): Promise<void> {
  try {
    // Anfragen ohne Termin haben (noch) kein Event – No-op.
    if (!booking.requestedDate) return;
    if (!isGoogleConfigured()) return;
    const conn = await getGoogleConnection();
    if (!conn) return;
    const main = conn.row.googleCalendarId;
    if (!main) return;

    const offer = booking.offerId ? await getOffer(booking.offerId) : undefined;
    const target = resolveTargetCalendar(conn.row.writeMode, offer?.calendarKey, main);

    const client = new GoogleCalendarClient();
    const accessToken = await client.getValidAccessToken(conn);
    // Eventdauer = Angebotsdauer + manuell erfasste Zusatzminuten (Step 5).
    const dauerMinuten = (offer?.durationMinutes ?? 60) + (booking.extraMinutes ?? 0);
    const payload = buildEventPayload(booking, dauerMinuten);

    // Liegt bereits ein Event im FALSCHEN Kalender, dort loeschen (Verschieben).
    if (
      booking.googleEventId &&
      booking.googleCalendarId &&
      booking.googleCalendarId !== target
    ) {
      try {
        await client.deleteEvent(accessToken, booking.googleCalendarId, booking.googleEventId);
      } catch (err) {
        console.warn('[google] altes Event konnte nicht entfernt werden:', err);
      }
    }

    // Event im richtigen Kalender aktualisieren ODER neu anlegen.
    if (booking.googleEventId && booking.googleCalendarId === target) {
      await client.updateEvent(accessToken, target, booking.googleEventId, payload);
      await setBookingGoogleSync(booking.id, booking.googleEventId, target);
    } else {
      const created = await client.insertEvent(accessToken, target, payload);
      if (created.id) {
        await setBookingGoogleSync(booking.id, created.id, target);
      }
    }
  } catch (err) {
    console.warn(
      '[google] pushBookingToGoogle fehlgeschlagen:',
      err instanceof Error ? err.message : String(err),
    );
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
 * Entfernt das zur Buchung gehoerende Google-Event aus dem richtigen Kalender
 * (booking.googleCalendarId, Fallback: Verbindungs-Hauptkalender).
 * Wirft NIE – Fehler werden nur geloggt.
 */
export async function removeBookingFromGoogle(booking: Booking): Promise<void> {
  try {
    if (!booking.googleEventId) return;
    if (!isGoogleConfigured()) return;
    const conn = await getGoogleConnection();
    if (!conn) return;
    const calendarId = booking.googleCalendarId ?? conn.row.googleCalendarId;
    if (!calendarId) return;

    const client = new GoogleCalendarClient();
    const accessToken = await client.getValidAccessToken(conn);
    await client.deleteEvent(accessToken, calendarId, booking.googleEventId);
    await clearBookingGoogleSync(booking.id);
  } catch (err) {
    console.warn(
      '[google] removeBookingFromGoogle fehlgeschlagen:',
      err instanceof Error ? err.message : String(err),
    );
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
/**
 * Wie googleBusyIntervals, aber für eine ganze Tagesliste (z. B. einen Monat)
 * mit nur EINEM Events-Abruf pro Belegungs-Kalender statt einem pro Tag.
 * Liefert pro ISO-Tag die belegten Intervalle; ohne Konfiguration/Verbindung
 * oder bei Fehlern überall [] (wirft NIE).
 */
export async function googleBusyIntervalsForDays(
  days: string[],
): Promise<Record<string, { start: string; durationMinutes: number }[]>> {
  const empty: Record<string, { start: string; durationMinutes: number }[]> = {};
  for (const d of days) empty[d] = [];
  if (days.length === 0) return empty;

  try {
    if (!isGoogleConfigured()) return empty;
    const conn = await getGoogleConnection();
    if (!conn) return empty;
    const main = conn.row.googleCalendarId;
    const ids =
      conn.row.busyCalendarIds && conn.row.busyCalendarIds.length > 0
        ? conn.row.busyCalendarIds
        : main
          ? [main]
          : [];
    if (ids.length === 0) return empty;

    const client = new GoogleCalendarClient();
    const accessToken = await client.getValidAccessToken(conn);
    const sorted = [...days].sort();
    const { timeMin } = zurichDayRangeIso(sorted[0]);
    const { timeMax } = zurichDayRangeIso(sorted[sorted.length - 1]);

    // Ein Abruf pro Kalender über die ganze Spanne; danach pro Tag bucketen
    // (eventsToBusyIntervals zählt nur Events, die am jeweiligen Tag beginnen).
    const eventLists = await Promise.all(
      ids.map(async (calId) => {
        try {
          const list = await client.listEvents(accessToken, calId, timeMin, timeMax);
          return list.items ?? [];
        } catch (err) {
          console.warn('[google] busy-Bereichsabruf fehlgeschlagen fuer', calId, err);
          return [];
        }
      }),
    );

    const result = empty;
    for (const day of days) {
      result[day] = mergeBusyIntervals(
        eventLists.map((events) => eventsToBusyIntervals(events, day)),
      );
    }
    return result;
  } catch (err) {
    console.warn(
      '[google] googleBusyIntervalsForDays fehlgeschlagen:',
      err instanceof Error ? err.message : String(err),
    );
    return empty;
  }
}

export async function googleBusyIntervals(
  dateStr: string,
): Promise<{ start: string; durationMinutes: number }[]> {
  try {
    if (!isGoogleConfigured()) return [];
    const conn = await getGoogleConnection();
    if (!conn) return [];
    const main = conn.row.googleCalendarId;
    const ids =
      conn.row.busyCalendarIds && conn.row.busyCalendarIds.length > 0
        ? conn.row.busyCalendarIds
        : main
          ? [main]
          : [];
    if (ids.length === 0) return [];

    const client = new GoogleCalendarClient();
    const accessToken = await client.getValidAccessToken(conn);
    const { timeMin, timeMax } = zurichDayRangeIso(dateStr);

    const lists = await Promise.all(
      ids.map(async (calId) => {
        try {
          const list = await client.listEvents(accessToken, calId, timeMin, timeMax);
          return eventsToBusyIntervals(list.items ?? [], dateStr);
        } catch (err) {
          console.warn('[google] busy-Abruf fehlgeschlagen fuer', calId, err);
          return [];
        }
      }),
    );
    return mergeBusyIntervals(lists);
  } catch (err) {
    console.warn(
      '[google] googleBusyIntervals fehlgeschlagen:',
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}
