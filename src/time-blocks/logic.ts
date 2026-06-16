// Pure Logik für Planer-Blocker. KEIN server-only: wird vom Repository-nahen
// Server-Code UND (für Dauer-Berechnung) von planner-actions genutzt.
// Lokale Zeit-Strings 'HH:MM', kein UTC.
import type { BusyInterval } from '@/availability/slots';

type BlockTimes = { startTime: string | null; endTime: string | null };

// 'HH:MM' → Minuten seit Mitternacht.
export function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Ganztägig, sobald Start- ODER Endzeit fehlt (Validierung erlaubt nur
// „beide leer" oder „beide gesetzt"; das `||` ist defensiv).
export function isWholeDay(b: BlockTimes): boolean {
  return !b.startTime || !b.endTime;
}

// Aggregiert die Blocks EINES Tages:
// - closed: true, sobald ein Ganztags-Block dabei ist.
// - busy:   ein BusyInterval je Zeitfenster-Block.
export function summarizeDayBlocks(blocks: BlockTimes[]): {
  closed: boolean;
  busy: BusyInterval[];
} {
  let closed = false;
  const busy: BusyInterval[] = [];
  for (const b of blocks) {
    if (isWholeDay(b)) {
      closed = true;
      continue;
    }
    const start = b.startTime as string;
    busy.push({
      start,
      durationMinutes: hhmmToMinutes(b.endTime as string) - hhmmToMinutes(start),
    });
  }
  return { closed, busy };
}
