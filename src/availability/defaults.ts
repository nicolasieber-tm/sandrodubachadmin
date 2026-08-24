// Standard-Öffnungszeiten für Wochentage, die (noch) nicht in der Tabelle
// `availability` stehen. KEIN server-only: die Auflösung ist reine Logik und
// wird sowohl vom Admin (Anzeige der sieben Zeilen) als auch von der
// Slot-Berechnung der öffentlichen Buchungsstrecke genutzt.
//
// Wichtig: Beide Seiten MÜSSEN dieselbe Auflösung verwenden. Sonst zeigt der
// Admin Öffnungszeiten an, unter denen die Buchungsstrecke gar keinen Tag
// freigibt (frisch aufgesetzte Umgebung, in der noch nie gespeichert wurde).
import type { Availability } from '@/db/schema';

// Wochentag-Konvention: 0=Montag … 6=Sonntag.
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const DEFAULT_START_TIME = '09:00';
export const DEFAULT_END_TIME = '18:00';

/**
 * Standard-Zeile eines Wochentags. Sonntag (6) ist standardmässig geschlossen,
 * Montag–Samstag sind von 09:00 bis 18:00 buchbar.
 *
 * Die `id` ist ein Platzhalter (`default-{weekday}`) — solche Zeilen stehen
 * nicht in der Datenbank, sie werden beim Speichern per Upsert angelegt.
 */
export function defaultAvailabilityRow(weekday: number): Availability {
  return {
    id: `default-${weekday}`,
    weekday,
    enabled: weekday !== 6,
    startTime: DEFAULT_START_TIME,
    endTime: DEFAULT_END_TIME,
  };
}

/**
 * Ergänzt gespeicherte Zeilen zu genau sieben, nach Wochentag sortiert:
 * gespeicherte Zeilen gewinnen, fehlende kommen aus `defaultAvailabilityRow`.
 */
export function resolveAvailability(rows: Availability[]): Availability[] {
  const byWeekday = new Map(rows.map((row) => [row.weekday, row]));
  return WEEKDAYS.map((weekday) => byWeekday.get(weekday) ?? defaultAvailabilityRow(weekday));
}
