import { describe, it, expect } from 'vitest';
import {
  computeEffectivePrice,
  computeSaving,
  validateDiscount,
  type DiscountValue,
} from './logic';

describe('computeEffectivePrice', () => {
  it('percent 25 % von 25000 ergibt 18750', () => {
    expect(computeEffectivePrice(25000, { valueType: 'percent', value: 25 })).toBe(18750);
  });

  it('percent 100 % ergibt 0', () => {
    expect(computeEffectivePrice(25000, { valueType: 'percent', value: 100 })).toBe(0);
  });

  it('percent rundet kaufmännisch auf ganze Rappen', () => {
    // 33 % von 10001 = 3300.33 -> Math.round 3300 -> 10001 - 3300 = 6701
    expect(computeEffectivePrice(10001, { valueType: 'percent', value: 33 })).toBe(6701);
  });

  it('fixed 5000 von 25000 ergibt 20000', () => {
    expect(computeEffectivePrice(25000, { valueType: 'fixed', value: 5000 })).toBe(20000);
  });

  it('fixed 30000 von 25000 wird auf 0 geklemmt (nie < 0)', () => {
    expect(computeEffectivePrice(25000, { valueType: 'fixed', value: 30000 })).toBe(0);
  });
});

describe('computeSaving', () => {
  it('percent 25 % von 25000 spart 6250', () => {
    expect(computeSaving(25000, { valueType: 'percent', value: 25 })).toBe(6250);
  });

  it('fixed 5000 von 25000 spart 5000', () => {
    expect(computeSaving(25000, { valueType: 'fixed', value: 5000 })).toBe(5000);
  });

  it('fixed 30000 von 25000 spart höchstens den Basispreis (25000)', () => {
    expect(computeSaving(25000, { valueType: 'fixed', value: 30000 })).toBe(25000);
  });
});

type Validatable = Parameters<typeof validateDiscount>[0];

function makeDiscount(overrides: Partial<Validatable> = {}): Validatable {
  return {
    active: true,
    validFrom: null,
    validUntil: null,
    maxRedemptions: null,
    redemptionsUsed: 0,
    offerId: null,
    ...overrides,
  };
}

describe('validateDiscount', () => {
  const now = new Date('2026-06-08T12:00:00Z');

  it('akzeptiert einen gültigen Rabatt', () => {
    expect(validateDiscount(makeDiscount(), { now })).toEqual({ ok: true });
  });

  it('lehnt inaktive Rabatte ab (inaktiv)', () => {
    expect(validateDiscount(makeDiscount({ active: false }), { now })).toEqual({
      ok: false,
      reason: 'inaktiv',
    });
  });

  it('lehnt noch nicht gültige Rabatte ab (noch_nicht_gueltig)', () => {
    const validFrom = new Date('2026-06-09T00:00:00Z');
    expect(validateDiscount(makeDiscount({ validFrom }), { now })).toEqual({
      ok: false,
      reason: 'noch_nicht_gueltig',
    });
  });

  it('lehnt abgelaufene Rabatte ab (abgelaufen)', () => {
    const validUntil = new Date('2026-06-07T00:00:00Z');
    expect(validateDiscount(makeDiscount({ validUntil }), { now })).toEqual({
      ok: false,
      reason: 'abgelaufen',
    });
  });

  it('lehnt aufgebrauchte Rabatte ab (aufgebraucht)', () => {
    expect(
      validateDiscount(makeDiscount({ maxRedemptions: 1, redemptionsUsed: 1 }), { now }),
    ).toEqual({ ok: false, reason: 'aufgebraucht' });
  });

  it('lehnt falsches Angebot ab (falsches_angebot)', () => {
    expect(
      validateDiscount(makeDiscount({ offerId: 'offer-a' }), { now, offerId: 'offer-b' }),
    ).toEqual({ ok: false, reason: 'falsches_angebot' });
  });

  it('akzeptiert passendes Angebot', () => {
    expect(
      validateDiscount(makeDiscount({ offerId: 'offer-a' }), { now, offerId: 'offer-a' }),
    ).toEqual({ ok: true });
  });

  it('prüft active vor allen anderen Gründen', () => {
    const validUntil = new Date('2026-06-07T00:00:00Z');
    expect(
      validateDiscount(makeDiscount({ active: false, validUntil }), { now }),
    ).toEqual({ ok: false, reason: 'inaktiv' });
  });
});

// Typ-Smoke: DiscountValue ist exportiert und nutzbar.
const _smoke: DiscountValue = { valueType: 'percent', value: 10 };
void _smoke;
