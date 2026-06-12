'use server';

import { getOffer, listAllOffers } from '@/offers/repository';
import { getAvailability } from '@/availability/repository';
import { listBookingsOnDate, listBookingsInRange } from '@/bookings/repository';
import { googleBusyIntervals, googleBusyIntervalsForDays } from '@/google/sync';
import {
  computeFreeSlots,
  computeSlotStatuses,
  type BusyInterval,
} from './slots';

// slots = freie Startzeiten, belegt = vergebene Kandidaten (das Widget zeigt
// sie durchgestrichen statt sie auszublenden).
export type FreeSlotsResult = { slots: string[]; belegt: string[] } | { error: string };

// Wochentag-Konvention der availability-Tabelle: 0=Montag … 6=Sonntag.
// JS getDay(): 0=Sonntag … 6=Samstag. Umrechnung: (getDay() + 6) % 7.
function ourWeekday(dateStr: string): number {
  return (new Date(`${dateStr}T00:00:00`).getDay() + 6) % 7;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Liefert die Start-Slots eines Tages für ein Angebot — frei UND vergeben.
 *
 * Ablauf:
 * 1. Angebot laden (Dauer = Slot-Länge). Fehlt es → Fehler.
 * 2. Verfügbarkeit des Wochentags bestimmen; nicht aktiv → keine Slots.
 * 3. Bestehende Buchungen (neu/bestaetigt) am Tag als belegte Intervalle
 *    aufbauen; Dauer = Dauer des gebuchten Angebots (Fallback 60) plus
 *    Zusatzminuten der Buchung.
 * 4. Reine Slot-Logik anwenden (Schrittweite 30 Minuten).
 */
export async function getFreeSlots(
  offerId: string,
  dateStr: string,
): Promise<FreeSlotsResult> {
  const offer = await getOffer(offerId);
  if (!offer) {
    return { error: 'Angebot nicht gefunden.' };
  }

  const weekday = ourWeekday(dateStr);
  const availability = await getAvailability();
  const row = availability.find((a) => a.weekday === weekday);
  if (!row || !row.enabled) {
    return { slots: [], belegt: [] };
  }

  const bookingsOnDate = await listBookingsOnDate(dateStr);

  // Angebotsdauern cachen, damit dasselbe Angebot nicht mehrfach geladen wird.
  const durationCache = new Map<string, number>([[offer.id, offer.durationMinutes]]);
  const busy: BusyInterval[] = [];
  for (const booking of bookingsOnDate) {
    const start = booking.requestedTime;
    if (!start) continue; // Ohne Uhrzeit belegt die Buchung keinen Slot.

    let durationMinutes = 60;
    if (booking.offerId) {
      const cached = durationCache.get(booking.offerId);
      if (cached !== undefined) {
        durationMinutes = cached;
      } else {
        const bookingOffer = await getOffer(booking.offerId);
        durationMinutes = bookingOffer?.durationMinutes ?? 60;
        durationCache.set(booking.offerId, durationMinutes);
      }
    }
    // Zusatzminuten verlängern den Termin (z. B. im Planer aufgezogene Dauer).
    busy.push({ start, durationMinutes: durationMinutes + (booking.extraMinutes ?? 0) });
  }

  // Im Google-Kalender belegte Zeiten ebenfalls als belegt behandeln. Ist
  // Google nicht konfiguriert/verbunden oder schlägt der Abruf fehl, liefert
  // googleBusyIntervals [] – die Slot-Berechnung läuft dann ohne Google weiter.
  const googleBusy = await googleBusyIntervals(dateStr);
  for (const interval of googleBusy) {
    busy.push(interval);
  }

  const statuses = computeSlotStatuses({
    enabled: true,
    startTime: row.startTime,
    endTime: row.endTime,
    slotMinutes: offer.durationMinutes,
    stepMinutes: 30,
    busy,
  });

  return {
    slots: statuses.filter((s) => s.frei).map((s) => s.time),
    belegt: statuses.filter((s) => !s.frei).map((s) => s.time),
  };
}

// volleTage = ausgebucht (durchgestrichen im Widget) · geschlosseneTage =
// Wochentag laut Verfügbarkeit nicht buchbar (grau ausgedunkelt wie
// vergangene Tage).
export type MonthAvailabilityResult =
  | { volleTage: string[]; geschlosseneTage: string[] }
  | { error: string };

/**
 * Liefert pro Monat die ausgebuchten Tage (kein freier Slot trotz buchbarem
 * Wochentag) und die geschlossenen Tage (Wochentag in der Verfügbarkeit
 * deaktiviert). Gleiche Belegungs-Semantik wie getFreeSlots; Google-Belegung
 * wird mit EINEM Abruf pro Kalender über den ganzen Monat geladen.
 */
export async function getMonthSlotAvailability(
  offerId: string,
  year: number,
  month: number, // 1–12
): Promise<MonthAvailabilityResult> {
  if (
    !Number.isInteger(year) || year < 2020 || year > 2100 ||
    !Number.isInteger(month) || month < 1 || month > 12
  ) {
    return { error: 'Ungültiger Monat.' };
  }

  const offer = await getOffer(offerId);
  if (!offer) {
    return { error: 'Angebot nicht gefunden.' };
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from(
    { length: daysInMonth },
    (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`,
  );

  const [availability, alleAngebote, rows, googleBusy] = await Promise.all([
    getAvailability(),
    listAllOffers(),
    listBookingsInRange(days[0], days[days.length - 1]),
    googleBusyIntervalsForDays(days),
  ]);

  const availByWeekday = new Map(availability.map((a) => [a.weekday, a]));
  const durationByOffer = new Map(alleAngebote.map((o) => [o.id, o.durationMinutes]));

  // Belegte Intervalle pro Tag (Semantik wie getFreeSlots: nur neu/bestaetigt
  // mit Uhrzeit; Dauer = Angebotsdauer + Zusatzminuten).
  const busyByDay = new Map<string, BusyInterval[]>();
  for (const b of rows) {
    if (b.status !== 'neu' && b.status !== 'bestaetigt') continue;
    if (!b.requestedDate || !b.requestedTime) continue;
    const dur =
      ((b.offerId ? durationByOffer.get(b.offerId) : undefined) ?? 60) +
      (b.extraMinutes ?? 0);
    const list = busyByDay.get(b.requestedDate);
    const interval = { start: b.requestedTime, durationMinutes: dur };
    if (list) list.push(interval);
    else busyByDay.set(b.requestedDate, [interval]);
  }

  const volleTage: string[] = [];
  const geschlosseneTage: string[] = [];
  for (const day of days) {
    const row = availByWeekday.get(ourWeekday(day));
    if (!row || !row.enabled) {
      geschlosseneTage.push(day);
      continue;
    }
    const frei = computeFreeSlots({
      enabled: true,
      startTime: row.startTime,
      endTime: row.endTime,
      slotMinutes: offer.durationMinutes,
      stepMinutes: 30,
      busy: [...(busyByDay.get(day) ?? []), ...(googleBusy[day] ?? [])],
    });
    if (frei.length === 0) volleTage.push(day);
  }

  return { volleTage, geschlosseneTage };
}
