// Reine, testbare Kalender-Logik — kein DB/Netz, kein server-only.
import type { BusyInterval } from '@/availability/slots';

export type WriteModeValue = 'main' | 'per_offer';

/**
 * Bestimmt den Zielkalender fuer eine Buchung.
 * - 'main': immer der Hauptkalender.
 * - 'per_offer': der Kalender des Angebots; fehlt er (null/leer), Fallback Hauptkalender.
 */
export function resolveTargetCalendar(
  mode: WriteModeValue,
  offerCalendarKey: string | null | undefined,
  mainCalendarId: string,
): string {
  if (mode === 'per_offer' && offerCalendarKey && offerCalendarKey.trim() !== '') {
    return offerCalendarKey;
  }
  return mainCalendarId;
}

/**
 * Fuehrt mehrere Busy-Listen zu einer flachen, deduplizierten Liste zusammen.
 * Zwei Intervalle gelten als identisch, wenn start UND durationMinutes gleich
 * sind (dasselbe Event kann in mehreren angehakten/geteilten Kalendern stehen).
 * Die Reihenfolge des erstmaligen Vorkommens bleibt erhalten.
 */
export function mergeBusyIntervals(lists: BusyInterval[][]): BusyInterval[] {
  const seen = new Set<string>();
  const result: BusyInterval[] = [];
  for (const interval of lists.flat()) {
    const key = `${interval.start}|${interval.durationMinutes}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(interval);
    }
  }
  return result;
}
