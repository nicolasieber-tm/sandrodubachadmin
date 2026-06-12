'use server';

import { listBookingsInRange } from './repository';
import type { BookingStatusValue } from './status';

// Eine Buchung in der Wochen-Belegung. Bewusst datensparsam: nur Datum, Zeit,
// Name und Status – KEINE Kontaktdaten (Mail/Telefon) anderer Kund:innen.
export interface WeekOverviewItem {
  date: string; // 'YYYY-MM-DD'
  time: string; // 'HH:MM' oder ''
  name: string;
  status: BookingStatusValue;
}

export interface WeekOverview {
  days: string[]; // sieben ISO-Tage Mo→So
  today: string; // ISO heute (für die Hervorhebung)
  rangeLabel: string; // z. B. „8.–14. Jun"
  items: WeekOverviewItem[]; // nicht-abgesagte Buchungen der Woche
}

const MONTH_ABBR_DE = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Montag 00:00 der Woche von `d` (lokale Zeit). getDay(): 0=So..6=Sa, daher
// (getDay() + 6) % 7 für den Abstand zum Montag (Konvention wie /admin/kalender).
function startOfWeekMonday(d: Date): Date {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffToMonday = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - diffToMonday);
  return base;
}

/**
 * Wochen-Belegung für die Termin-Detail-Ansicht: die sieben Tage (Mo→So) der
 * Woche um `anchorIso` (Wunsch-/Termindatum der geöffneten Buchung; ohne Anker
 * → heute), verschoben um `weekOffset` Wochen, samt der nicht-abgesagten
 * Buchungen dieser Woche.
 */
export async function getBookingWeekOverview(
  anchorIso: string | null,
  weekOffset: number,
): Promise<WeekOverview> {
  const now = new Date();
  const todayIso = toIso(now);

  // Anker string-basiert (TZ-robust): Mitternacht lokal liefert den korrekten
  // Wochentag. Ohne Datum (Anfrage ohne Termin) startet die aktuelle Woche.
  const base = anchorIso ? new Date(`${anchorIso}T00:00:00`) : now;
  const weekStart = startOfWeekMonday(base);
  weekStart.setDate(weekStart.getDate() + Math.trunc(weekOffset) * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return toIso(d);
  });

  const bookings = await listBookingsInRange(days[0], days[6]);
  const items: WeekOverviewItem[] = bookings
    .filter((b) => b.requestedDate)
    .map((b) => ({
      date: b.requestedDate as string,
      time: b.requestedTime ?? '',
      name: b.customerName,
      status: b.status as BookingStatusValue,
    }));

  const startD = new Date(`${days[0]}T00:00:00`);
  const endD = new Date(`${days[6]}T00:00:00`);
  const sameMonth = startD.getMonth() === endD.getMonth();
  const rangeLabel = sameMonth
    ? `${startD.getDate()}.–${endD.getDate()}. ${MONTH_ABBR_DE[endD.getMonth()]}`
    : `${startD.getDate()}. ${MONTH_ABBR_DE[startD.getMonth()]} – ${endD.getDate()}. ${MONTH_ABBR_DE[endD.getMonth()]}`;

  return { days, today: todayIso, rangeLabel, items };
}
