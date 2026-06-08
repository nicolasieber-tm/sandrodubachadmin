import { describe, it, expect } from 'vitest';
import { formatRappen, formatPrice } from './money';

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
