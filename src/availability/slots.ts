// Reine, testbare Slot-Logik – keine DB, kein server-only.
// Zeiten immer im Format 'HH:MM' (24h). Intern wird in Minuten gerechnet.

/** Wandelt 'HH:MM' in Minuten seit Mitternacht um. '09:30' → 570. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
}

/** Wandelt Minuten seit Mitternacht in 'HH:MM' um. 570 → '09:30'. */
export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}`;
}

export interface BusyInterval {
  /** Startzeit 'HH:MM'. */
  start: string;
  /** Dauer in Minuten. */
  durationMinutes: number;
}

export interface ComputeFreeSlotsParams {
  /** Ist der Wochentag überhaupt buchbar? */
  enabled: boolean;
  /** Beginn des Verfügbarkeitsfensters 'HH:MM'. */
  startTime: string;
  /** Ende des Verfügbarkeitsfensters 'HH:MM'. */
  endTime: string;
  /** Dauer eines Slots in Minuten (= Dauer des gewählten Angebots). */
  slotMinutes: number;
  /** Schrittweite der Kandidaten-Startzeiten in Minuten. */
  stepMinutes: number;
  /** Bereits belegte Intervalle. */
  busy: BusyInterval[];
}

/**
 * Berechnet die freien Start-Slots eines Tages.
 *
 * Kandidaten-Startzeiten laufen von `startTime` bis `endTime - slotMinutes`
 * in `stepMinutes`-Schritten. Ein Kandidat fällt weg, wenn das Intervall
 * `[start, start+slotMinutes)` ein `busy`-Intervall `[b.start, b.start+b.dur)`
 * überlappt. Zwei Intervalle überlappen, wenn `aStart < bEnd && bStart < aEnd`
 * (direkt angrenzende Intervalle gelten nicht als Überlappung).
 *
 * Bei `!enabled` wird immer `[]` geliefert.
 */
export function computeFreeSlots(params: ComputeFreeSlotsParams): string[] {
  if (!params.enabled) return [];

  const windowStart = timeToMinutes(params.startTime);
  const windowEnd = timeToMinutes(params.endTime);
  const { slotMinutes, stepMinutes } = params;

  if (stepMinutes <= 0 || slotMinutes <= 0) return [];

  const busy = params.busy.map((b) => {
    const bStart = timeToMinutes(b.start);
    return { start: bStart, end: bStart + b.durationMinutes };
  });

  const slots: string[] = [];
  // Letzter zulässiger Start, damit der Slot noch ins Fenster passt.
  const lastStart = windowEnd - slotMinutes;
  for (let start = windowStart; start <= lastStart; start += stepMinutes) {
    const end = start + slotMinutes;
    const overlaps = busy.some((b) => start < b.end && b.start < end);
    if (!overlaps) {
      slots.push(minutesToTime(start));
    }
  }
  return slots;
}
