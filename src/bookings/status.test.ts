import { describe, it, expect } from 'vitest';
import {
  STATUS_LABEL,
  statusBadgeClass,
  ALLOWED_TRANSITIONS,
  canTransition,
  nextActions,
  type BookingStatusValue,
} from './status';

describe('STATUS_LABEL', () => {
  it('liefert die deutschen Labels', () => {
    expect(STATUS_LABEL.neu).toBe('Neu');
    expect(STATUS_LABEL.bestaetigt).toBe('Bestätigt');
    expect(STATUS_LABEL.abgesagt).toBe('Abgesagt');
    expect(STATUS_LABEL.erledigt).toBe('Erledigt');
  });
});

describe('statusBadgeClass', () => {
  it('liefert die Badge-CSS-Klassen', () => {
    expect(statusBadgeClass('neu')).toBe('st-new');
    expect(statusBadgeClass('bestaetigt')).toBe('st-conf');
    expect(statusBadgeClass('abgesagt')).toBe('st-canc');
    expect(statusBadgeClass('erledigt')).toBe('st-done');
  });
});

describe('ALLOWED_TRANSITIONS', () => {
  it('definiert die erlaubten Folgezustände', () => {
    expect(ALLOWED_TRANSITIONS.neu).toEqual(['bestaetigt', 'abgesagt']);
    expect(ALLOWED_TRANSITIONS.bestaetigt).toEqual(['erledigt', 'abgesagt']);
    expect(ALLOWED_TRANSITIONS.abgesagt).toEqual([]);
    expect(ALLOWED_TRANSITIONS.erledigt).toEqual([]);
  });
});

describe('nextActions', () => {
  it('liefert für "neu" sowohl bestaetigt als auch abgesagt', () => {
    const actions = nextActions('neu');
    expect(actions).toContain('bestaetigt');
    expect(actions).toContain('abgesagt');
  });

  it('liefert für "abgesagt" ein leeres Array', () => {
    expect(nextActions('abgesagt')).toEqual([]);
  });

  it('liefert für "erledigt" ein leeres Array', () => {
    expect(nextActions('erledigt')).toEqual([]);
  });
});

describe('canTransition', () => {
  it('erlaubt neu -> bestaetigt', () => {
    expect(canTransition('neu', 'bestaetigt')).toBe(true);
  });

  it('verbietet abgesagt -> bestaetigt', () => {
    expect(canTransition('abgesagt', 'bestaetigt')).toBe(false);
  });

  it('erlaubt bestaetigt -> erledigt', () => {
    expect(canTransition('bestaetigt', 'erledigt')).toBe(true);
  });

  it('verbietet einen Übergang auf sich selbst', () => {
    const all: BookingStatusValue[] = ['neu', 'bestaetigt', 'abgesagt', 'erledigt'];
    for (const s of all) {
      expect(canTransition(s, s)).toBe(false);
    }
  });
});
