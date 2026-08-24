import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Availability, Booking, Offer, TimeBlock } from '@/db/schema';

// Regressionstest zum Fehlerbild «im Buchungs-Widget ist kein Tag waehlbar».
//
// Ursache war: In einer frisch aufgesetzten Umgebung ist die Tabelle
// `availability` leer. Der Admin (/admin/kalender) zeigt dort trotzdem sieben
// Zeilen aus Standardwerten an – die Slot-Berechnung wertete eine fehlende
// Zeile aber als «Wochentag nicht buchbar». Ergebnis: jeder Tag geschlossen,
// ohne dass im Admin etwas falsch aussah.
//
// Strategie wie in google/sync.service.test.ts: alle DB-/Netz-Schichten via
// vi.mock ersetzen, die reine Slot-Logik bleibt echt.

vi.mock('@/offers/repository', () => ({
  getOffer: vi.fn(),
  listAllOffers: vi.fn(),
}));
vi.mock('@/availability/repository', () => ({
  getAvailability: vi.fn(),
}));
vi.mock('@/bookings/repository', () => ({
  listBookingsOnDate: vi.fn(async () => [] as Booking[]),
  listBookingsInRange: vi.fn(async () => [] as Booking[]),
}));
vi.mock('@/google/sync', () => ({
  googleBusyIntervals: vi.fn(async () => []),
  googleBusyIntervalsForDays: vi.fn(async () => ({})),
}));
vi.mock('@/time-blocks/repository', () => ({
  getBlocksOnDate: vi.fn(async () => [] as TimeBlock[]),
  listBlocksInRange: vi.fn(async () => [] as TimeBlock[]),
}));

import { getFreeSlots, getMonthSlotAvailabilityForOffers } from './slots-actions';
import { getOffer, listAllOffers } from '@/offers/repository';
import { getAvailability } from '@/availability/repository';

const getOfferMock = vi.mocked(getOffer);
const listAllOffersMock = vi.mocked(listAllOffers);
const getAvailabilityMock = vi.mocked(getAvailability);

const OFFER_ID = 'offer-1';

// Nur die Felder, welche die Slot-Berechnung tatsaechlich liest.
function offer(): Offer {
  return {
    id: OFFER_ID,
    name: 'Klassische Massage',
    durationMinutes: 60,
    bookingMode: 'termin',
  } as Offer;
}

// Sonntage im August 2026.
const SONNTAGE = ['2026-08-02', '2026-08-09', '2026-08-16', '2026-08-23', '2026-08-30'];

beforeEach(() => {
  vi.clearAllMocks();
  getOfferMock.mockResolvedValue(offer());
  listAllOffersMock.mockResolvedValue([offer()]);
});

describe('getMonthSlotAvailabilityForOffers – leere Verfügbarkeitstabelle', () => {
  it('sperrt nicht den ganzen Monat, sondern nutzt die Standard-Öffnungszeiten', async () => {
    getAvailabilityMock.mockResolvedValue([]); // frisch aufgesetzte Umgebung

    const res = await getMonthSlotAvailabilityForOffers([OFFER_ID], 2026, 8);
    expect('byOffer' in res).toBe(true);
    if (!('byOffer' in res)) return;

    // Nur Sonntag ist im Standard geschlossen – nicht alle 31 Tage.
    expect(res.byOffer[OFFER_ID].geschlosseneTage).toEqual(SONNTAGE);
    expect(res.byOffer[OFFER_ID].volleTage).toEqual([]);
  });

  it('respektiert gespeicherte Zeilen weiterhin (bewusst deaktivierter Wochentag)', async () => {
    // Alle sieben Tage gespeichert und deaktiviert = bewusste Konfiguration.
    const rows: Availability[] = Array.from({ length: 7 }, (_, weekday) => ({
      id: `db-${weekday}`,
      weekday,
      enabled: false,
      startTime: '09:00',
      endTime: '18:00',
    }));
    getAvailabilityMock.mockResolvedValue(rows);

    const res = await getMonthSlotAvailabilityForOffers([OFFER_ID], 2026, 8);
    if (!('byOffer' in res)) throw new Error('unerwarteter Fehler');
    expect(res.byOffer[OFFER_ID].geschlosseneTage).toHaveLength(31);
  });
});

describe('getFreeSlots – leere Verfügbarkeitstabelle', () => {
  it('liefert Slots aus den Standard-Öffnungszeiten statt einer leeren Liste', async () => {
    getAvailabilityMock.mockResolvedValue([]);

    const res = await getFreeSlots(OFFER_ID, '2026-08-24'); // Montag
    expect('slots' in res).toBe(true);
    if (!('slots' in res)) return;
    // Standardfenster 09:00–18:00, 60-Minuten-Angebot, 30-Minuten-Raster.
    expect(res.slots[0]).toBe('09:00');
    expect(res.slots.at(-1)).toBe('17:00');
  });

  it('bleibt am Sonntag geschlossen (Standard)', async () => {
    getAvailabilityMock.mockResolvedValue([]);

    const res = await getFreeSlots(OFFER_ID, '2026-08-23'); // Sonntag
    if (!('slots' in res)) throw new Error('unerwarteter Fehler');
    expect(res.slots).toEqual([]);
  });
});
