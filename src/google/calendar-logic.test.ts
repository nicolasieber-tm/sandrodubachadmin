import { describe, it, expect } from 'vitest';
import { resolveTargetCalendar, mergeBusyIntervals } from './calendar-logic';

describe('resolveTargetCalendar', () => {
  const main = 'main@x.ch';
  it('main-Modus → immer Hauptkalender', () => {
    expect(resolveTargetCalendar('main', 'studio@g', main)).toBe(main);
    expect(resolveTargetCalendar('main', null, main)).toBe(main);
  });
  it('per_offer-Modus → Angebots-Kalender', () => {
    expect(resolveTargetCalendar('per_offer', 'studio@g', main)).toBe('studio@g');
  });
  it('per_offer ohne Angebots-Kalender → Fallback Hauptkalender', () => {
    expect(resolveTargetCalendar('per_offer', null, main)).toBe(main);
    expect(resolveTargetCalendar('per_offer', '', main)).toBe(main);
  });
});

describe('mergeBusyIntervals', () => {
  it('fuehrt mehrere Listen zusammen', () => {
    const a = [{ start: '08:00', durationMinutes: 60 }];
    const b = [{ start: '10:00', durationMinutes: 30 }];
    expect(mergeBusyIntervals([a, b])).toEqual([
      { start: '08:00', durationMinutes: 60 },
      { start: '10:00', durationMinutes: 30 },
    ]);
  });
  it('leere und fehlende Listen sind unkritisch', () => {
    expect(mergeBusyIntervals([[], []])).toEqual([]);
    expect(mergeBusyIntervals([])).toEqual([]);
  });
  it('dedupliziert identische Intervalle aus mehreren Kalendern', () => {
    const shared = { start: '09:00', durationMinutes: 60 };
    const unique = { start: '11:00', durationMinutes: 30 };
    // shared erscheint in zwei Kalendern; erwartet: nur einmal in Ausgabe.
    expect(mergeBusyIntervals([[shared, unique], [shared]])).toEqual([shared, unique]);
  });
  it('behaelt Reihenfolge des erstmaligen Vorkommens bei', () => {
    const a = { start: '08:00', durationMinutes: 45 };
    const b = { start: '10:00', durationMinutes: 90 };
    expect(mergeBusyIntervals([[b, a], [a, b]])).toEqual([b, a]);
  });
});
