// Reine, testbare Auslastungs-Logik – keine DB, kein server-only.
// Berechnet die Wochenauslastung aus vorbereiteten Eingaben (verfuegbare und
// belegte Minuten). Zeiten kommen im Format 'HH:MM'; intern wird in Minuten
// gerechnet. `timeToMinutes` wird aus slots.ts wiederverwendet.

import { timeToMinutes } from './slots';

/** Fallback-Dauer in Minuten, wenn das Angebot fehlt oder geloescht wurde. */
const FALLBACK_DURATION_MINUTES = 60;

/** Eine Tageszeile der Verfuegbarkeit (Mo–So). */
export interface UtilizationDay {
  /** Ist der Tag ueberhaupt buchbar? */
  enabled: boolean;
  /** Beginn des Verfuegbarkeitsfensters 'HH:MM'. */
  startTime: string;
  /** Ende des Verfuegbarkeitsfensters 'HH:MM'. */
  endTime: string;
}

/** Eine Buchung, reduziert auf die fuer die Auslastung noetigen Felder. */
export interface UtilizationBooking {
  /** Angebots-ID (oder null, wenn Angebot geloescht/ohne). */
  offerId: string | null;
  /** Wunschuhrzeit 'HH:MM'; '' bedeutet ohne Uhrzeit → zaehlt nicht. */
  requestedTime: string;
  /** Zusatzminuten (z. B. Anfahrt/Aufbau), zaehlen zur belegten Dauer. */
  extraMinutes: number;
}

/**
 * Summiert die verfuegbaren Minuten ueber alle aktiven Tage der Woche.
 *
 * Pro aktivem Tag wird `endTime − startTime` addiert. Ungueltige Fenster
 * (Ende <= Start) zaehlen 0, damit fehlerhafte Konfigurationen die Summe nicht
 * verfaelschen. Deaktivierte Tage werden ignoriert.
 */
export function sumAvailableMinutes(days: UtilizationDay[]): number {
  let total = 0;
  for (const day of days) {
    if (!day.enabled) continue;
    const span = timeToMinutes(day.endTime) - timeToMinutes(day.startTime);
    if (span > 0) total += span;
  }
  return total;
}

/**
 * Summiert die belegten Minuten aller Buchungen mit Uhrzeit.
 *
 * Pro Buchung: Angebotsdauer (aus `durations`, Fallback 60 Min wenn das Angebot
 * fehlt oder geloescht ist) plus `extraMinutes`. Buchungen ohne Uhrzeit
 * (`requestedTime === ''`) werden ignoriert.
 */
export function sumBookedMinutes(
  bookings: UtilizationBooking[],
  durations: Map<string, number>,
): number {
  let total = 0;
  for (const booking of bookings) {
    if (booking.requestedTime === '') continue;
    const base =
      booking.offerId !== null
        ? durations.get(booking.offerId) ?? FALLBACK_DURATION_MINUTES
        : FALLBACK_DURATION_MINUTES;
    total += base + booking.extraMinutes;
  }
  return total;
}

/**
 * Berechnet den gerundeten Auslastungsprozentwert (0–100).
 *
 * - Sind keine Minuten verfuegbar (`availableMinutes <= 0`), gibt es keine
 *   sinnvolle Auslastung → `null` (vermeidet Division durch 0).
 * - Negative belegte Minuten werden als 0 behandelt (Schutz).
 * - Das Ergebnis wird auf 0–100 gedeckelt und kaufmaennisch gerundet.
 */
export function computeUtilizationPercent(
  availableMinutes: number,
  bookedMinutes: number,
): number | null {
  if (availableMinutes <= 0) return null;
  const booked = Math.max(0, bookedMinutes);
  const ratio = booked / availableMinutes;
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.round(clamped * 100);
}
