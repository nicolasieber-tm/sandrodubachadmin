import { describe, it, expect } from 'vitest';
import { updateBookingSchema } from './booking-input';

// REINE Logik-Tests fuer das Bearbeiten-Schema (kein DB/Netz).
// Schwerpunkt: Checkbox-Normalisierung (notifyCustomer), Preis-Coercion und Defaults.

describe('updateBookingSchema', () => {
  it('akzeptiert Datum, Zeit, Ort und Preis und setzt notifyCustomer auf true bei "on"', () => {
    const result = updateBookingSchema.safeParse({
      requestedDate: '2026-07-01',
      requestedTime: '14:30',
      location: 'Bern',
      priceChf: '250',
      notifyCustomer: 'on',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requestedDate).toBe('2026-07-01');
      expect(result.data.requestedTime).toBe('14:30');
      expect(result.data.location).toBe('Bern');
      expect(result.data.priceChf).toBe(250);
      expect(result.data.notifyCustomer).toBe(true);
    }
  });

  it('coerced den Preis aus einem String mit Dezimalstellen', () => {
    const result = updateBookingSchema.safeParse({
      requestedDate: '2026-07-01',
      priceChf: '199.50',
      notifyCustomer: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // Rappen-Umrechnung passiert in der Action; hier nur die CHF-Coercion.
      expect(result.data.priceChf).toBe(199.5);
    }
  });

  it('normalisiert ein fehlendes Checkbox-Feld (null) auf false', () => {
    const result = updateBookingSchema.safeParse({
      requestedDate: '2026-07-01',
      requestedTime: '',
      location: '',
      priceChf: '0',
      notifyCustomer: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notifyCustomer).toBe(false);
    }
  });

  it('normalisiert ein gaenzlich fehlendes notifyCustomer (undefined) auf false', () => {
    const result = updateBookingSchema.safeParse({
      requestedDate: '2026-07-01',
      priceChf: '120',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notifyCustomer).toBe(false);
      // Optionale Felder erhalten ihre Defaults (leerer String).
      expect(result.data.requestedTime).toBe('');
      expect(result.data.location).toBe('');
    }
  });

  it('lehnt einen negativen Preis ab', () => {
    const result = updateBookingSchema.safeParse({
      requestedDate: '2026-07-01',
      priceChf: '-5',
      notifyCustomer: 'on',
    });

    expect(result.success).toBe(false);
  });

  it('coerced Wegkosten und Zusatzminuten und setzt Defaults auf 0', () => {
    const ohne = updateBookingSchema.safeParse({
      requestedDate: '2026-07-01',
      priceChf: '250',
    });
    expect(ohne.success).toBe(true);
    if (ohne.success) {
      expect(ohne.data.travelCostChf).toBe(0);
      expect(ohne.data.extraMinutes).toBe(0);
    }

    const mit = updateBookingSchema.safeParse({
      requestedDate: '2026-07-01',
      priceChf: '250',
      travelCostChf: '45.50',
      extraMinutes: '30',
    });
    expect(mit.success).toBe(true);
    if (mit.success) {
      expect(mit.data.travelCostChf).toBe(45.5);
      expect(mit.data.extraMinutes).toBe(30);
    }
  });

  it('lehnt negative Wegkosten und nicht-ganze Zusatzminuten ab', () => {
    const negativ = updateBookingSchema.safeParse({
      requestedDate: '2026-07-01',
      priceChf: '250',
      travelCostChf: '-1',
    });
    expect(negativ.success).toBe(false);

    const bruch = updateBookingSchema.safeParse({
      requestedDate: '2026-07-01',
      priceChf: '250',
      extraMinutes: '12.5',
    });
    expect(bruch.success).toBe(false);
  });

  it('erlaubt ein leeres Datum (Anfrage ohne festgelegten Termin)', () => {
    const result = updateBookingSchema.safeParse({
      requestedDate: '',
      priceChf: '100',
      notifyCustomer: 'on',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requestedDate).toBe('');
    }
  });
});
