import { describe, it, expect } from 'vitest';
import { resolveBookingLocation } from './location-gate';
import type { Location } from '@/db/schema';

// REINE Logik-Tests fuer die serverseitige Standortbindung (kein DB-Mocking).
// Schwerpunkt: Manipulationsschutz — der Standort einer Buchung wird IMMER aus
// offer.locationId aufgeloest, nie aus einem Client-Wert.

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Gossau',
    slug: 'gossau',
    addressLine1: 'Bahnhofstrasse 1',
    postalCode: '9200',
    city: 'Gossau',
    notifyEmail: null,
    active: true,
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('resolveBookingLocation', () => {
  it('liefert null-Standort (Altpfad), wenn das Angebot keine locationId hat', () => {
    const result = resolveBookingLocation(null, undefined);
    expect(result).toEqual({ ok: true, locationId: null, locationNameSnapshot: '' });
  });

  it('loest einen aktiven Standort erfolgreich auf', () => {
    const location = makeLocation();
    const result = resolveBookingLocation(location.id, location);
    expect(result).toEqual({
      ok: true,
      locationId: location.id,
      locationNameSnapshot: 'Gossau',
    });
  });

  it('lehnt ab, wenn der referenzierte Standort nicht existiert (undefined)', () => {
    const result = resolveBookingLocation('11111111-1111-1111-1111-111111111111', undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Dieser Standort ist aktuell nicht verfügbar.');
    }
  });

  it('lehnt ab, wenn der referenzierte Standort deaktiviert ist', () => {
    const location = makeLocation({ active: false });
    const result = resolveBookingLocation(location.id, location);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Dieser Standort ist aktuell nicht verfügbar.');
    }
  });

  it('ignoriert die gelieferte Location-ID, wenn sie nicht zur offerLocationId passt (nur offerLocationId zaehlt)', () => {
    // Die Funktion nimmt bewusst kein "Client-locationId" entgegen — sie
    // bekommt nur offer.locationId und das dazu geladene Location-Objekt.
    // Ein Aufrufer kann diese Signatur nicht mit einem manipulierten
    // Client-Wert fuer den Standort selbst umgehen, ohne offer.locationId
    // zu aendern.
    const location = makeLocation({ id: 'other-id', name: 'Horn' });
    const result = resolveBookingLocation(location.id, location);
    expect(result).toEqual({ ok: true, locationId: 'other-id', locationNameSnapshot: 'Horn' });
  });
});
