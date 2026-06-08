import { describe, it, expect } from 'vitest';
import { availabilitySchema } from './input';

// Hilfsfunktion: sieben gültige Standard-Zeilen (0=Montag … 6=Sonntag).
function sevenRows() {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    enabled: weekday !== 6,
    startTime: '09:00',
    endTime: '18:00',
  }));
}

describe('availabilitySchema', () => {
  it('akzeptiert sieben gültige Zeilen', () => {
    const result = availabilitySchema.safeParse({ rows: sevenRows() });
    expect(result.success).toBe(true);
  });

  it('lehnt ungültige Zeitformate ab', () => {
    const rows = sevenRows();
    rows[0].startTime = '9:00';
    const result = availabilitySchema.safeParse({ rows });
    expect(result.success).toBe(false);
  });

  it('lehnt eine falsche Anzahl Zeilen ab', () => {
    const rows = sevenRows().slice(0, 6);
    const result = availabilitySchema.safeParse({ rows });
    expect(result.success).toBe(false);
  });

  it('lehnt Wochentage ausserhalb 0–6 ab', () => {
    const rows = sevenRows();
    rows[6].weekday = 7;
    const result = availabilitySchema.safeParse({ rows });
    expect(result.success).toBe(false);
  });
});
