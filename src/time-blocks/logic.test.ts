import { describe, it, expect } from 'vitest';
import { hhmmToMinutes, isWholeDay, summarizeDayBlocks } from './logic';

describe('hhmmToMinutes', () => {
  it('rechnet HH:MM in Minuten um', () => {
    expect(hhmmToMinutes('09:00')).toBe(540);
    expect(hhmmToMinutes('17:30')).toBe(1050);
  });
});

describe('isWholeDay', () => {
  it('ist ganztägig, wenn keine Zeiten gesetzt sind', () => {
    expect(isWholeDay({ startTime: null, endTime: null })).toBe(true);
  });
  it('ist ganztägig, wenn nur eine Zeit fehlt', () => {
    expect(isWholeDay({ startTime: '09:00', endTime: null })).toBe(true);
  });
  it('ist KEIN Ganztag bei gesetztem Fenster', () => {
    expect(isWholeDay({ startTime: '09:00', endTime: '17:00' })).toBe(false);
  });
});

describe('summarizeDayBlocks', () => {
  it('macht aus einem Zeitfenster ein busy-Intervall', () => {
    const r = summarizeDayBlocks([{ startTime: '09:00', endTime: '17:00' }]);
    expect(r.closed).toBe(false);
    expect(r.busy).toEqual([{ start: '09:00', durationMinutes: 480 }]);
  });
  it('schliesst den Tag bei einem Ganztags-Block', () => {
    const r = summarizeDayBlocks([{ startTime: null, endTime: null }]);
    expect(r.closed).toBe(true);
    expect(r.busy).toEqual([]);
  });
  it('sammelt mehrere Zeitfenster am selben Tag', () => {
    const r = summarizeDayBlocks([
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '14:00', endTime: '15:30' },
    ]);
    expect(r.closed).toBe(false);
    expect(r.busy).toEqual([
      { start: '09:00', durationMinutes: 60 },
      { start: '14:00', durationMinutes: 90 },
    ]);
  });
  it('Mix aus Ganztag und Fenster schliesst den Tag', () => {
    const r = summarizeDayBlocks([
      { startTime: null, endTime: null },
      { startTime: '14:00', endTime: '15:00' },
    ]);
    expect(r.closed).toBe(true);
  });
  it('leere Liste: kein Block', () => {
    const r = summarizeDayBlocks([]);
    expect(r).toEqual({ closed: false, busy: [] });
  });
});
