import { describe, it, expect } from 'vitest';
import { dayMonth } from './date';

describe('dayMonth', () => {
  it('zerlegt ein ISO-Datum in Tag-Zahl und deutsches Monatskürzel', () => {
    expect(dayMonth('2026-06-08')).toEqual({ day: '8', month: 'JUN' });
  });

  it('entfernt die führende Null beim Tag', () => {
    expect(dayMonth('2026-01-01')).toEqual({ day: '1', month: 'JAN' });
  });

  it('nutzt das Umlaut-Kürzel MÄR für März', () => {
    expect(dayMonth('2026-03-15')).toEqual({ day: '15', month: 'MÄR' });
  });

  it('liefert für jeden Monat das passende Kürzel', () => {
    expect(dayMonth('2026-02-28').month).toBe('FEB');
    expect(dayMonth('2026-04-10').month).toBe('APR');
    expect(dayMonth('2026-05-01').month).toBe('MAI');
    expect(dayMonth('2026-07-04').month).toBe('JUL');
    expect(dayMonth('2026-08-20').month).toBe('AUG');
    expect(dayMonth('2026-09-09').month).toBe('SEP');
    expect(dayMonth('2026-10-31').month).toBe('OKT');
    expect(dayMonth('2026-11-11').month).toBe('NOV');
    expect(dayMonth('2026-12-24').month).toBe('DEZ');
  });
});
