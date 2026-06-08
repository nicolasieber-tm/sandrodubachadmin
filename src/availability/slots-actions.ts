'use server';

import { getOffer } from '@/offers/repository';
import { getAvailability } from '@/availability/repository';
import { listBookingsOnDate } from '@/bookings/repository';
import { computeFreeSlots, type BusyInterval } from './slots';

export type FreeSlotsResult = { slots: string[] } | { error: string };

// Wochentag-Konvention der availability-Tabelle: 0=Montag … 6=Sonntag.
// JS getDay(): 0=Sonntag … 6=Samstag. Umrechnung: (getDay() + 6) % 7.
function ourWeekday(dateStr: string): number {
  return (new Date(`${dateStr}T00:00:00`).getDay() + 6) % 7;
}

/**
 * Liefert die an einem Tag noch freien Start-Slots für ein Angebot.
 *
 * Ablauf:
 * 1. Angebot laden (Dauer = Slot-Länge). Fehlt es → Fehler.
 * 2. Verfügbarkeit des Wochentags bestimmen; nicht aktiv → keine Slots.
 * 3. Bestehende Buchungen (neu/bestaetigt) am Tag als belegte Intervalle
 *    aufbauen; die Dauer stammt aus dem jeweils gebuchten Angebot (Fallback 60).
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
    return { slots: [] };
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
    busy.push({ start, durationMinutes });
  }

  const slots = computeFreeSlots({
    enabled: true,
    startTime: row.startTime,
    endTime: row.endTime,
    slotMinutes: offer.durationMinutes,
    stepMinutes: 30,
    busy,
  });

  return { slots };
}
