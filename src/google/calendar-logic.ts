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

/** Fuehrt mehrere Busy-Listen zu einer flachen Liste zusammen. */
export function mergeBusyIntervals(lists: BusyInterval[][]): BusyInterval[] {
  return lists.flat();
}
