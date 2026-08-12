import { describe, it, expect } from 'vitest';
import { computeLocationGate, offersForSelectedLocation } from './location-filter';
import type { Offer, Location } from '@/db/schema';

// REINE Logik-Tests (kein DOM/Testing-Library) fuer die Standortwahl der
// Buchungsstrecke: welche Standorte/Angebote erscheinen, und wie wird nach
// gewaehltem Standort gefiltert.

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: 'loc-gossau',
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

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 'offer-1',
    name: 'Klassische Massage',
    priceRappen: 10000,
    unit: 'pauschal',
    durationMinutes: 60,
    bufferMinutes: 0,
    description: '',
    logoDataUrl: null,
    calendarKey: null,
    active: true,
    sortOrder: 0,
    customFields: [],
    standardFields: {},
    bookingMode: 'termin',
    travelRuleId: null,
    locationId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('computeLocationGate', () => {
  it('braucht keinen Standort-Schritt ohne Standorte', () => {
    const gate = computeLocationGate([makeOffer()], []);
    expect(gate.needsLocationStep).toBe(false);
    expect(gate.selectableLocations).toEqual([]);
  });

  it('braucht keinen Standort-Schritt, wenn kein Angebot einem Standort zugeordnet ist', () => {
    const gossau = makeLocation();
    const gate = computeLocationGate([makeOffer({ locationId: null })], [gossau]);
    expect(gate.needsLocationStep).toBe(false);
    expect(gate.selectableLocations).toEqual([]);
    expect(gate.legacyOffers).toHaveLength(1);
  });

  it('zeigt nur Standorte, die tatsaechlich ein zugeordnetes Angebot haben', () => {
    const gossau = makeLocation({ id: 'loc-gossau', name: 'Gossau' });
    const horn = makeLocation({ id: 'loc-horn', name: 'Horn', slug: 'horn', city: 'Horn' });
    const offerGossau = makeOffer({ id: 'o1', locationId: 'loc-gossau' });
    const gate = computeLocationGate([offerGossau], [gossau, horn]);
    expect(gate.needsLocationStep).toBe(true);
    expect(gate.selectableLocations.map((l) => l.id)).toEqual(['loc-gossau']);
    expect(gate.locationOffers).toEqual([offerGossau]);
  });

  it('trennt Angebote mit Standort von Altpfad-Angeboten ohne Standort', () => {
    const gossau = makeLocation();
    const offerMitStandort = makeOffer({ id: 'o1', locationId: 'loc-gossau' });
    const offerOhneStandort = makeOffer({ id: 'o2', locationId: null });
    const gate = computeLocationGate([offerMitStandort, offerOhneStandort], [gossau]);
    expect(gate.locationOffers).toEqual([offerMitStandort]);
    expect(gate.legacyOffers).toEqual([offerOhneStandort]);
  });

  it('ein Angebot mit locationId auf einen inaktiven/geloeschten Standort taucht nirgends auf', () => {
    // "locations" enthaelt hier nur aktive Standorte (wie listActiveLocations
    // liefert) — ein Angebot, dessen locationId nicht darunter ist, gilt als
    // verwaist und darf weder unter seinem Standort noch als Altpfad-Angebot
    // erscheinen.
    const gossau = makeLocation({ id: 'loc-gossau' });
    const verwaistesAngebot = makeOffer({ id: 'o1', locationId: 'loc-deaktiviert' });
    const gate = computeLocationGate([verwaistesAngebot], [gossau]);
    expect(gate.locationOffers).toEqual([]);
    expect(gate.legacyOffers).toEqual([]);
    expect(gate.needsLocationStep).toBe(false);
  });
});

describe('offersForSelectedLocation', () => {
  it('liefert ohne aktives Gate alle Angebote unveraendert', () => {
    const offers = [makeOffer({ id: 'o1' }), makeOffer({ id: 'o2' })];
    const gate = computeLocationGate(offers, []);
    expect(offersForSelectedLocation(gate, offers, null)).toEqual(offers);
  });

  it('liefert bei aktivem Gate ohne Auswahl keine Angebote', () => {
    const gossau = makeLocation();
    const offers = [makeOffer({ id: 'o1', locationId: 'loc-gossau' })];
    const gate = computeLocationGate(offers, [gossau]);
    expect(offersForSelectedLocation(gate, offers, null)).toEqual([]);
  });

  it('filtert bei aktivem Gate ausschliesslich auf Angebote des gewaehlten Standorts, nie Altpfad-Angebote mischen', () => {
    const gossau = makeLocation({ id: 'loc-gossau' });
    const horn = makeLocation({ id: 'loc-horn', name: 'Horn', slug: 'horn' });
    const offerGossau = makeOffer({ id: 'o1', locationId: 'loc-gossau' });
    const offerHorn = makeOffer({ id: 'o2', locationId: 'loc-horn' });
    const offerAltpfad = makeOffer({ id: 'o3', locationId: null });
    const offers = [offerGossau, offerHorn, offerAltpfad];
    const gate = computeLocationGate(offers, [gossau, horn]);
    expect(offersForSelectedLocation(gate, offers, 'loc-gossau')).toEqual([offerGossau]);
    expect(offersForSelectedLocation(gate, offers, 'loc-horn')).toEqual([offerHorn]);
  });
});
