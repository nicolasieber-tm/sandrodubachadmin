import { describe, it, expect } from 'vitest';
import type { Availability } from '@/db/schema';
import { defaultAvailabilityRow, resolveAvailability } from './defaults';

// Wochentag-Konvention: 0=Montag … 6=Sonntag.
function row(weekday: number, over: Partial<Availability> = {}): Availability {
  return {
    id: `db-${weekday}`,
    weekday,
    enabled: true,
    startTime: '10:00',
    endTime: '20:00',
    ...over,
  };
}

describe('defaultAvailabilityRow', () => {
  it('ist Montag bis Samstag aktiv und Sonntag geschlossen', () => {
    for (const weekday of [0, 1, 2, 3, 4, 5]) {
      expect(defaultAvailabilityRow(weekday).enabled).toBe(true);
    }
    expect(defaultAvailabilityRow(6).enabled).toBe(false);
  });

  it('nutzt 09:00–18:00 als Standardfenster', () => {
    const r = defaultAvailabilityRow(0);
    expect(r.startTime).toBe('09:00');
    expect(r.endTime).toBe('18:00');
  });
});

describe('resolveAvailability', () => {
  it('liefert bei leerer Tabelle sieben Standard-Zeilen', () => {
    const rows = resolveAvailability([]);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rows.filter((r) => r.enabled)).toHaveLength(6); // ohne Sonntag
  });

  it('bevorzugt gespeicherte Zeilen gegenüber dem Standard', () => {
    const rows = resolveAvailability([row(0, { enabled: false })]);
    expect(rows[0].enabled).toBe(false);
    expect(rows[0].startTime).toBe('10:00');
  });

  it('ergänzt nur die fehlenden Wochentage', () => {
    const rows = resolveAvailability([row(6, { enabled: true })]);
    expect(rows[6].enabled).toBe(true); // gespeicherter Sonntag bleibt aktiv
    expect(rows[6].startTime).toBe('10:00');
    expect(rows[0].startTime).toBe('09:00'); // Montag aus dem Standard
  });

  it('sortiert immer nach Wochentag, unabhängig von der Eingabereihenfolge', () => {
    const rows = resolveAvailability([row(4), row(1)]);
    expect(rows.map((r) => r.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
