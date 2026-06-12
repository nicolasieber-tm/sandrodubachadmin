// Regressionstest: formData.get() liefert null fuer Felder, deren Input nicht
// im DOM war (zugeklappter Nachricht-/Rabatt-Fold, kein Einmal-Link-Token,
// ausgeblendetes Telefon/Ort-Feld). Das Schema muss null wie "nicht angegeben"
// behandeln (-> ''), sonst scheitert jede oeffentliche Buchung.
import { describe, it, expect } from 'vitest';
import { publicBookingSchema } from './public-input';

const OFFER_ID = '4f5b1c1e-9b1a-4c2e-8f5d-2a7b9c0d1e2f';

// Eingabe wie sie submitBookingRequest aus FormData baut: fehlende Felder
// kommen als null an, vorhandene als String.
function eingabe(overrides: Record<string, unknown> = {}) {
  return {
    offerId: OFFER_ID,
    customerName: 'Max Muster',
    customerEmail: 'max@example.com',
    customerPhone: '079 123 45 67',
    requestedDate: '2026-06-20',
    requestedTime: '14:00',
    location: 'Bern',
    message: null, // Nachricht-Fold zu -> Input nicht im DOM
    code: null, // Rabatt-Fold zu -> Input nicht im DOM
    token: null, // kein Einmal-Link
    website: '',
    ...overrides,
  };
}

describe('publicBookingSchema', () => {
  it('akzeptiert null fuer optionale Felder und normalisiert auf ""', () => {
    const r = publicBookingSchema.safeParse(eingabe());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.message).toBe('');
      expect(r.data.code).toBe('');
      expect(r.data.token).toBe('');
    }
  });

  it('akzeptiert null fuer Telefon/Ort (per standardFields ausblendbar)', () => {
    const r = publicBookingSchema.safeParse(
      eingabe({ customerPhone: null, location: null, website: null }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.customerPhone).toBe('');
      expect(r.data.location).toBe('');
      expect(r.data.website).toBe('');
    }
  });

  it('liefert weiterhin Strings fuer vorhandene Werte', () => {
    const r = publicBookingSchema.safeParse(eingabe({ message: 'Hallo', code: 'SOMMER25' }));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.message).toBe('Hallo');
      expect(r.data.code).toBe('SOMMER25');
    }
  });

  it('weist zu kurzen Namen weiterhin ab', () => {
    expect(publicBookingSchema.safeParse(eingabe({ customerName: 'M' })).success).toBe(false);
  });

  it('weist ungueltige E-Mail weiterhin ab', () => {
    expect(publicBookingSchema.safeParse(eingabe({ customerEmail: 'keine-mail' })).success).toBe(false);
  });

  it('weist ungueltige offerId weiterhin ab', () => {
    expect(publicBookingSchema.safeParse(eingabe({ offerId: 'nicht-uuid' })).success).toBe(false);
  });
});
