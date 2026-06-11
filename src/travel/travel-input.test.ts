import { describe, it, expect } from 'vitest';
import { travelRuleSchema } from './travel-input';

// Basis-Eingabe wie aus dem Formular (FormData liefert Strings).
function eingabe(overrides: Record<string, string | undefined> = {}) {
  return {
    name: 'Region Bern',
    baseLocation: 'Bern Bahnhof',
    freeRadiusKm: '30',
    ratePerKmChf: '0.9',
    ...overrides,
  };
}

describe('travelRuleSchema – Koordinaten aus dem Karten-Picker', () => {
  it('parst gesetzte Koordinaten als Zahlen', () => {
    const r = travelRuleSchema.safeParse(
      eingabe({ baseLat: '46.9489', baseLng: '7.4398' }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.baseLat).toBeCloseTo(46.9489);
      expect(r.data.baseLng).toBeCloseTo(7.4398);
    }
  });

  it('leere Strings (kein Pin gesetzt) werden zu null', () => {
    const r = travelRuleSchema.safeParse(eingabe({ baseLat: '', baseLng: '' }));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.baseLat).toBeNull();
      expect(r.data.baseLng).toBeNull();
    }
  });

  it('fehlende Felder (alte Formulare) werden zu null', () => {
    const r = travelRuleSchema.safeParse(eingabe());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.baseLat).toBeNull();
      expect(r.data.baseLng).toBeNull();
    }
  });

  it('lehnt nicht-numerische Koordinaten ab', () => {
    const r = travelRuleSchema.safeParse(
      eingabe({ baseLat: 'abc', baseLng: '7.44' }),
    );
    expect(r.success).toBe(false);
  });

  it('lehnt Koordinaten ausserhalb des gueltigen Bereichs ab', () => {
    expect(
      travelRuleSchema.safeParse(eingabe({ baseLat: '91', baseLng: '7.44' })).success,
    ).toBe(false);
    expect(
      travelRuleSchema.safeParse(eingabe({ baseLat: '46.9', baseLng: '181' })).success,
    ).toBe(false);
  });
});
