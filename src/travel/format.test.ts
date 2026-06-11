import { describe, it, expect } from 'vitest';
import { travelRuleHint, travelRuleKurz } from './format';
import type { TravelRule } from '@/db/schema';

// Tests fuer die REINE Hinweis-Formatierung (kein DB/Netz noetig).

function rule(overrides: Partial<TravelRule> = {}): TravelRule {
  return {
    id: 'tr-1',
    name: 'Region Bern',
    baseLocation: 'Bern Bahnhof',
    freeRadiusKm: 30,
    ratePerKmRappen: 90,
    createdAt: new Date('2026-06-01T08:00:00Z'),
    ...overrides,
  };
}

describe('travelRuleHint', () => {
  it('nennt Freiradius, Standort und rappengenauen km-Ansatz', () => {
    expect(travelRuleHint(rule())).toBe(
      'Anfahrt: Im Umkreis von 30 km um Bern Bahnhof fallen keine Wegkosten an, darüber hinaus 0.90 CHF pro km (ab Bern Bahnhof).',
    );
  });

  it('lässt den Freiradius-Teil bei Radius 0 weg', () => {
    expect(travelRuleHint(rule({ freeRadiusKm: 0 }))).toBe(
      'Anfahrt: Wegkosten von 0.90 CHF pro km ab Bern Bahnhof.',
    );
  });
});

describe('travelRuleKurz', () => {
  it('formatiert die Kurzform fuer das Admin-Termindetail', () => {
    expect(travelRuleKurz(rule())).toBe(
      'Region Bern: 30 km um Bern Bahnhof frei, danach 0.90 CHF/km',
    );
  });

  it('formatiert ganze Frankenbetraege ohne Nachkommastellen', () => {
    expect(travelRuleKurz(rule({ freeRadiusKm: 0, ratePerKmRappen: 200 }))).toBe(
      'Region Bern: 2 CHF/km ab Bern Bahnhof',
    );
  });
});
