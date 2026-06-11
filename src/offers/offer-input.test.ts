import { describe, it, expect } from 'vitest';
import { offerSchema } from './offer-input';

describe('offerSchema', () => {
  it('akzeptiert ein vollständiges Angebot', () => {
    const result = offerSchema.safeParse({
      name: 'Hochzeitsreportage',
      priceChf: '2500',
      unit: 'pauschal',
      durationMinutes: '120',
      description: 'Begleitung von morgens bis abends.',
      active: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // priceChf wird per coerce zur Zahl.
      expect(result.data.priceChf).toBe(2500);
      expect(result.data.unit).toBe('pauschal');
      // durationMinutes wird per coerce zur Zahl.
      expect(result.data.durationMinutes).toBe(120);
    }
  });

  it('setzt Defaults für optionale Felder', () => {
    const result = offerSchema.safeParse({
      name: 'Portrait',
      priceChf: 200,
      unit: 'pro_stunde',
      durationMinutes: 60,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('');
      expect(result.data.active).toBe(true);
    }
  });

  it('lehnt zu kurze Namen ab', () => {
    const result = offerSchema.safeParse({
      name: 'A',
      priceChf: 100,
      unit: 'pauschal',
      durationMinutes: 60,
    });
    expect(result.success).toBe(false);
  });

  it('lehnt negative Preise ab', () => {
    const result = offerSchema.safeParse({
      name: 'Test',
      priceChf: -5,
      unit: 'pauschal',
      durationMinutes: 60,
    });
    expect(result.success).toBe(false);
  });

  it('lehnt eine Dauer unter 15 Minuten ab', () => {
    const result = offerSchema.safeParse({
      name: 'Test',
      priceChf: 100,
      unit: 'pauschal',
      durationMinutes: 10,
    });
    expect(result.success).toBe(false);
  });

  it('lehnt ungültige Einheiten ab', () => {
    const result = offerSchema.safeParse({
      name: 'Test',
      priceChf: 100,
      unit: 'pro_tag',
      durationMinutes: 60,
    });
    expect(result.success).toBe(false);
  });
});
