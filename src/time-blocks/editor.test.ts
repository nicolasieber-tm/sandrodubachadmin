import { describe, it, expect } from 'vitest';
import { buildBlockerInput } from './editor';

describe('buildBlockerInput', () => {
  it('ganztägig: leere Zeiten, Name getrimmt', () => {
    const r = buildBlockerInput({ date: '2026-06-17', von: '09:00', bis: '17:00', name: '  Ferien  ', wholeDay: true });
    expect(r).toEqual({ ok: true, input: { blockDate: '2026-06-17', startTime: null, endTime: null, reason: 'Ferien' } });
  });

  it('ganztägig ohne Name: reason null', () => {
    const r = buildBlockerInput({ date: '2026-06-17', von: '09:00', bis: '17:00', name: '   ', wholeDay: true });
    expect(r).toEqual({ ok: true, input: { blockDate: '2026-06-17', startTime: null, endTime: null, reason: null } });
  });

  it('Zeitfenster: Von/Bis gesetzt, Name übernommen', () => {
    const r = buildBlockerInput({ date: '2026-06-17', von: '09:00', bis: '12:30', name: 'Arzt', wholeDay: false });
    expect(r).toEqual({ ok: true, input: { blockDate: '2026-06-17', startTime: '09:00', endTime: '12:30', reason: 'Arzt' } });
  });

  it('Zeitfenster mit Bis = Von: Fehler', () => {
    const r = buildBlockerInput({ date: '2026-06-17', von: '09:00', bis: '09:00', name: '', wholeDay: false });
    expect(r).toEqual({ ok: false, error: 'Die End-Zeit muss nach der Start-Zeit liegen.' });
  });

  it('Zeitfenster mit Bis vor Von: Fehler', () => {
    const r = buildBlockerInput({ date: '2026-06-17', von: '14:00', bis: '13:00', name: '', wholeDay: false });
    expect(r).toEqual({ ok: false, error: 'Die End-Zeit muss nach der Start-Zeit liegen.' });
  });
});
