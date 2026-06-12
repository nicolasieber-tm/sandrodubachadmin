import 'server-only';
import { getAvailability } from '@/availability/repository';
import { listBookingsInRange } from '@/bookings/repository';
import { listAllOffers } from '@/offers/repository';
import type { Availability } from '@/db/schema';
import {
  computeUtilizationPercent,
  sumAvailableMinutes,
  sumBookedMinutes,
  type UtilizationDay,
  type UtilizationBooking,
} from './utilization';

/** Ergebnis der Wochenauslastung. `prozent === null` = keine Oeffnungszeiten. */
export type WeeklyUtilization = { prozent: number | null };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Montag 00:00 der laufenden Woche (lokale Zeit). getDay(): 0=So..6=Sa,
// daher (getDay() + 6) % 7 fuer den Abstand zum Montag.
function startOfWeekMonday(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffToMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

// Wochentag-Konvention der availability-Tabelle: 0=Montag … 6=Sonntag.
// Default-Zeile, falls in der DB (noch) nicht vorhanden – konsistent zu
// defaultRow() im Kalender-UI (src/app/admin/kalender/page.tsx). Sonntag
// (weekday 6) ist standardmaessig deaktiviert.
function defaultDay(weekday: number): UtilizationDay {
  return {
    enabled: weekday !== 6,
    startTime: '09:00',
    endTime: '18:00',
  };
}

function toUtilizationDay(row: Availability): UtilizationDay {
  return { enabled: row.enabled, startTime: row.startTime, endTime: row.endTime };
}

/**
 * Berechnet die Auslastung der laufenden Woche (Montag bis Sonntag, ganze
 * Woche inkl. Zukunftstage).
 *
 * Ablauf:
 * 1. Verfuegbare Minuten: pro Wochentag (0=Montag … 6=Sonntag) die passende
 *    availability-Zeile nehmen (fehlt sie, Default wie im UI), aktive Tage
 *    summieren.
 * 2. Belegte Minuten: Buchungen der Woche via listBookingsInRange (filtert
 *    abgesagte raus). Pro Buchung mit Uhrzeit = Angebotsdauer + extraMinutes;
 *    Angebotsdauern einmalig in eine Map laden (Fallback 60 Min).
 * 3. Reine Logik (computeUtilizationPercent) liefert den gedeckelten,
 *    gerundeten Prozentwert; null = keine Oeffnungszeiten.
 *
 * Kein Google-Busy – nur DB-Buchungen, schnell und deterministisch.
 */
export async function getWeeklyUtilization(
  now: Date = new Date(),
): Promise<WeeklyUtilization> {
  const weekStart = startOfWeekMonday(now);
  const fromIso = toIso(weekStart);
  const sunday = new Date(weekStart);
  sunday.setDate(weekStart.getDate() + 6);
  const toIsoStr = toIso(sunday);

  const [availabilityRows, weekBookings, offers] = await Promise.all([
    getAvailability(),
    listBookingsInRange(fromIso, toIsoStr),
    listAllOffers(),
  ]);

  // Verfuegbare Minuten: immer sieben Tage (0=Montag … 6=Sonntag), fehlende
  // Zeilen mit Default ergaenzen – konsistent zum Kalender-UI.
  const byWeekday = new Map(availabilityRows.map((row) => [row.weekday, row]));
  const days: UtilizationDay[] = Array.from({ length: 7 }, (_, weekday) => {
    const row = byWeekday.get(weekday);
    return row ? toUtilizationDay(row) : defaultDay(weekday);
  });
  const availableMinutes = sumAvailableMinutes(days);

  // Angebotsdauern einmalig in eine Map; Buchungen liefern nur offerId.
  const durations = new Map<string, number>(
    offers.map((offer) => [offer.id, offer.durationMinutes]),
  );
  const bookings: UtilizationBooking[] = weekBookings
    .filter((b) => b.requestedDate !== null && b.requestedTime !== '')
    .map((b) => ({
      offerId: b.offerId,
      requestedTime: b.requestedTime,
      extraMinutes: b.extraMinutes,
    }));
  const bookedMinutes = sumBookedMinutes(bookings, durations);

  return { prozent: computeUtilizationPercent(availableMinutes, bookedMinutes) };
}
