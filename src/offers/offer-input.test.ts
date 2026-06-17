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

const base = {
  name: 'Shooting',
  priceChf: 100,
  unit: 'pauschal' as const,
  durationMinutes: 60,
};

describe('offerSchema.logoDataUrl', () => {
  it('akzeptiert eine gültige Bild-Data-URL', () => {
    const r = offerSchema.safeParse({ ...base, logoDataUrl: 'data:image/webp;base64,AAAA' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.logoDataUrl).toBe('data:image/webp;base64,AAAA');
  });

  it('macht aus einem leeren String null', () => {
    const r = offerSchema.safeParse({ ...base, logoDataUrl: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.logoDataUrl).toBeNull();
  });

  it('macht aus einem fehlenden Feld null', () => {
    const r = offerSchema.safeParse({ ...base });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.logoDataUrl).toBeNull();
  });

  it('lehnt eine Nicht-Data-URL ab', () => {
    const r = offerSchema.safeParse({ ...base, logoDataUrl: 'https://example.com/logo.png' });
    expect(r.success).toBe(false);
  });

  it('lehnt eine zu grosse Data-URL ab', () => {
    const big = 'data:image/webp;base64,' + 'A'.repeat(200_001);
    const r = offerSchema.safeParse({ ...base, logoDataUrl: big });
    expect(r.success).toBe(false);
  });
});
