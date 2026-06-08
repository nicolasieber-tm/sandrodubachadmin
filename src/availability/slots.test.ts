import { describe, it, expect } from 'vitest';
import { timeToMinutes, minutesToTime, computeFreeSlots } from './slots';

describe('timeToMinutes / minutesToTime', () => {
  it('rechnet HH:MM in Minuten um', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:00')).toBe(540);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('rechnet Minuten in HH:MM um (mit führenden Nullen)', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(540)).toBe('09:00');
    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(1439)).toBe('23:59');
  });

  it('ist umkehrbar (round-trip)', () => {
    for (const t of ['07:05', '12:00', '18:45', '22:15']) {
      expect(minutesToTime(timeToMinutes(t))).toBe(t);
    }
  });
});

describe('computeFreeSlots', () => {
  it('gibt bei geschlossenem Tag ein leeres Array zurück', () => {
    const slots = computeFreeSlots({
      enabled: false,
      startTime: '09:00',
      endTime: '18:00',
      slotMinutes: 60,
      stepMinutes: 60,
      busy: [],
    });
    expect(slots).toEqual([]);
  });

  it('liefert alle Slots, wenn der Tag offen und nichts belegt ist', () => {
    const slots = computeFreeSlots({
      enabled: true,
      startTime: '09:00',
      endTime: '12:00',
      slotMinutes: 60,
      stepMinutes: 60,
      busy: [],
    });
    expect(slots).toEqual(['09:00', '10:00', '11:00']);
  });

  it('entfernt einen Slot, der von einer Buchung belegt ist', () => {
    const slots = computeFreeSlots({
      enabled: true,
      startTime: '09:00',
      endTime: '12:00',
      slotMinutes: 60,
      stepMinutes: 60,
      busy: [{ start: '10:00', durationMinutes: 60 }],
    });
    expect(slots).toEqual(['09:00', '11:00']);
  });

  it('schliesst Slots aus, die über den Tagesrand hinausragen', () => {
    // 11:00 würde bis 12:00 reichen (passt), 11:30 nicht mehr (endet 12:30).
    const slots = computeFreeSlots({
      enabled: true,
      startTime: '09:00',
      endTime: '12:00',
      slotMinutes: 60,
      stepMinutes: 30,
      busy: [],
    });
    expect(slots).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00']);
    expect(slots).not.toContain('11:30');
  });

  it('entfernt Kandidaten bei Teilüberlappung', () => {
    // busy 09:30–10:30 überlappt 09:00–10:00 und 10:00–11:00.
    const slots = computeFreeSlots({
      enabled: true,
      startTime: '09:00',
      endTime: '12:00',
      slotMinutes: 60,
      stepMinutes: 30,
      busy: [{ start: '09:30', durationMinutes: 60 }],
    });
    expect(slots).not.toContain('09:00');
    expect(slots).not.toContain('09:30');
    expect(slots).not.toContain('10:00');
    expect(slots).toContain('10:30');
    expect(slots).toContain('11:00');
  });

  it('behandelt direkt angrenzende Buchungen nicht als Überlappung', () => {
    // busy 10:00–11:00; Slot 09:00–10:00 grenzt an, überlappt aber nicht.
    const slots = computeFreeSlots({
      enabled: true,
      startTime: '09:00',
      endTime: '12:00',
      slotMinutes: 60,
      stepMinutes: 60,
      busy: [{ start: '10:00', durationMinutes: 60 }],
    });
    expect(slots).toContain('09:00');
    expect(slots).toContain('11:00');
    expect(slots).not.toContain('10:00');
  });

  it('gibt ein leeres Array zurück, wenn das Fenster kürzer als ein Slot ist', () => {
    const slots = computeFreeSlots({
      enabled: true,
      startTime: '10:00',
      endTime: '10:30',
      slotMinutes: 60,
      stepMinutes: 30,
      busy: [],
    });
    expect(slots).toEqual([]);
  });
});
