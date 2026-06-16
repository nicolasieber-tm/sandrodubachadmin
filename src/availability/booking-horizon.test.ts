import { describe, it, expect } from 'vitest';
import { addMonths, maxBookingDate, isWithinHorizon } from './booking-horizon';

// Hinweis: Monat ist 0-basiert (5 = Juni).
describe('addMonths', () => {
  it('verschiebt im Normalfall um N Monate', () => {
    const r = addMonths(new Date(2026, 5, 16), 2); // 16.06.2026 + 2
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2026, 7, 16]); // 16.08.2026
  });

  it('rechnet über den Jahreswechsel', () => {
    const r = addMonths(new Date(2026, 10, 30), 3); // 30.11.2026 + 3
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2027, 1, 28]); // 28.02.2027 (geklammert)
  });

  it('klemmt auf das Monatsende (kein Schaltjahr)', () => {
    const r = addMonths(new Date(2026, 0, 31), 1); // 31.01.2026 + 1
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2026, 1, 28]); // 28.02.2026
  });

  it('klemmt auf das Monatsende (Schaltjahr)', () => {
    const r = addMonths(new Date(2028, 0, 31), 1); // 31.01.2028 + 1
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2028, 1, 29]); // 29.02.2028
  });
});

describe('maxBookingDate', () => {
  it('liefert null bei unbegrenzt (null/0/negativ)', () => {
    const now = new Date(2026, 5, 16);
    expect(maxBookingDate(now, null)).toBeNull();
    expect(maxBookingDate(now, 0)).toBeNull();
    expect(maxBookingDate(now, -1)).toBeNull();
  });

  it('liefert die lokale Mitternacht des Zieltags', () => {
    const r = maxBookingDate(new Date(2026, 5, 16, 14, 30), 2);
    expect(r).not.toBeNull();
    expect([r!.getFullYear(), r!.getMonth(), r!.getDate(), r!.getHours()]).toEqual([2026, 7, 16, 0]);
  });
});

describe('isWithinHorizon', () => {
  const now = new Date(2026, 5, 16); // 16.06.2026

  it('erlaubt Datum vor dem Limit', () => {
    expect(isWithinHorizon('2026-07-01', now, 2)).toBe(true);
  });

  it('erlaubt das Limit-Datum exakt', () => {
    expect(isWithinHorizon('2026-08-16', now, 2)).toBe(true);
  });

  it('lehnt Datum nach dem Limit ab', () => {
    expect(isWithinHorizon('2026-08-17', now, 2)).toBe(false);
  });

  it('erlaubt alles bei unbegrenzt (null)', () => {
    expect(isWithinHorizon('2027-01-01', now, null)).toBe(true);
  });
});
