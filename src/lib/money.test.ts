import { describe, it, expect } from 'vitest';
import { formatRappen, formatPrice, formatRappenExakt, gesamtpreisRappen } from './money';

describe('formatRappen', () => {
  it('formatiert ganze Franken ohne Tausendertrennzeichen', () => {
    expect(formatRappen(25000)).toBe('250 CHF');
  });

  it('formatiert Tausender mit schmalem Leerzeichen (U+202F)', () => {
    expect(formatRappen(315000)).toBe('3 150 CHF');
  });

  it('formatiert 0 als "0 CHF"', () => {
    expect(formatRappen(0)).toBe('0 CHF');
  });

  it('rundet auf ganze Franken', () => {
    expect(formatRappen(25049)).toBe('250 CHF');
    expect(formatRappen(25050)).toBe('251 CHF');
  });
});

describe('formatPrice', () => {
  it('hängt " / Std" bei pro_stunde an', () => {
    expect(formatPrice(20000, 'pro_stunde')).toBe('200 CHF / Std');
  });

  it('gibt bei pauschal keinen Suffix aus', () => {
    expect(formatPrice(25000, 'pauschal')).toBe('250 CHF');
  });

  it('nutzt das schmale Leerzeichen auch bei pro_stunde', () => {
    expect(formatPrice(315000, 'pro_stunde')).toBe('3 150 CHF / Std');
  });
});

describe('formatRappenExakt', () => {
  it('zeigt Kleinbetraege mit zwei Nachkommastellen', () => {
    expect(formatRappenExakt(90)).toBe('0.90 CHF');
    expect(formatRappenExakt(125)).toBe('1.25 CHF');
  });

  it('zeigt ganze Frankenbetraege wie formatRappen', () => {
    expect(formatRappenExakt(200)).toBe('2 CHF');
    expect(formatRappenExakt(315000)).toBe('3 150 CHF');
  });
});

describe('gesamtpreisRappen', () => {
  it('addiert Wegkosten zum Angebotspreis', () => {
    expect(gesamtpreisRappen(25000, 5000)).toBe(30000);
  });

  it('behandelt fehlende Wegkosten als 0', () => {
    expect(gesamtpreisRappen(25000)).toBe(25000);
  });

  it('liefert bei 0 Wegkosten den reinen Angebotspreis', () => {
    expect(gesamtpreisRappen(18000, 0)).toBe(18000);
  });
});
