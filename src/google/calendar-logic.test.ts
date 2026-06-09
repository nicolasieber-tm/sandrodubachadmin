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
});
