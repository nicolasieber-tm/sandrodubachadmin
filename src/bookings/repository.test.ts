import { describe, it, expect, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { offers, bookings } from '@/db/schema';
import {
  createBooking,
  getBooking,
  listBookings,
  setBookingStatus,
  getDashboardStats,
} from './repository';

// IDs der im Test erzeugten Datensätze, damit afterAll alles wieder entfernt.
const createdOfferIds: string[] = [];
const createdBookingIds: string[] = [];

afterAll(async () => {
  if (createdBookingIds.length > 0) {
    await db.delete(bookings).where(inArray(bookings.id, createdBookingIds));
  }
  if (createdOfferIds.length > 0) {
    await db.delete(offers).where(inArray(offers.id, createdOfferIds));
  }
});

describe('bookings repository (Integration)', () => {
  it('legt eine Buchung an und liest sie zurück', async () => {
    const [offer] = await db
      .insert(offers)
      .values({
        name: 'Test-Angebot',
        priceRappen: 25000,
        unit: 'pauschal',
        sortOrder: 999,
        active: true,
      })
      .returning();
    createdOfferIds.push(offer.id);

    const booking = await createBooking({
      offerId: offer.id,
      offerNameSnapshot: offer.name,
      customerName: 'Test Kundin',
      customerEmail: 'test@example.ch',
      customerPhone: '+41 79 000 00 00',
      requestedDate: '2026-06-20',
      requestedTime: '14:00',
      location: 'Bern',
      priceRappen: offer.priceRappen,
      source: 'iframe',
    });
    createdBookingIds.push(booking.id);

    expect(booking.id).toBeDefined();
    expect(booking.status).toBe('neu');
    expect(booking.source).toBe('iframe');
    expect(booking.decidedAt).toBeNull();

    const fetched = await getBooking(booking.id);
    expect(fetched?.id).toBe(booking.id);
    expect(fetched?.customerName).toBe('Test Kundin');
  });

  it('listet neue Buchungen und filtert nach Status', async () => {
    const booking = await createBooking({
      offerNameSnapshot: 'Ohne Angebot',
      customerName: 'Filter Test',
      customerEmail: 'filter@example.ch',
      requestedDate: '2026-06-21',
      priceRappen: 20000,
    });
    createdBookingIds.push(booking.id);

    const neue = await listBookings({ status: 'neu' });
    expect(neue.some((b) => b.id === booking.id)).toBe(true);

    const bestaetigt = await listBookings({ status: 'bestaetigt' });
    expect(bestaetigt.some((b) => b.id === booking.id)).toBe(false);
  });

  it('setzt den Status und füllt decidedAt', async () => {
    const booking = await createBooking({
      offerNameSnapshot: 'Status Test',
      customerName: 'Status Kunde',
      customerEmail: 'status@example.ch',
      requestedDate: '2026-06-22',
      priceRappen: 40000,
    });
    createdBookingIds.push(booking.id);

    const updated = await setBookingStatus(booking.id, 'bestaetigt');
    expect(updated?.status).toBe('bestaetigt');
    expect(updated?.decidedAt).not.toBeNull();

    // Zurück auf "neu" setzt decidedAt wieder auf null.
    const reset = await setBookingStatus(booking.id, 'neu');
    expect(reset?.status).toBe('neu');
    expect(reset?.decidedAt).toBeNull();
  });

  it('liefert ein Dashboard-Statistik-Objekt mit Zahlen und Listen', async () => {
    const stats = await getDashboardStats();
    expect(typeof stats.neueAnfragen).toBe('number');
    expect(typeof stats.bestaetigtDieseWoche).toBe('number');
    expect(typeof stats.umsatzMonatRappen).toBe('number');
    expect(Array.isArray(stats.naechsteTermine)).toBe(true);
    expect(Array.isArray(stats.neueListe)).toBe(true);
    expect(stats.naechsteTermine.length).toBeLessThanOrEqual(5);
    expect(stats.neueListe.length).toBeLessThanOrEqual(5);
  });
});
