import { describe, it, expect, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { offers, bookings, discounts, discountRedemptions } from '@/db/schema';
import { applyRedemption, findRedeemable } from './redeem';

// IDs der im Test erzeugten Datensätze, damit afterAll alles wieder entfernt.
const createdOfferIds: string[] = [];
const createdBookingIds: string[] = [];
const createdDiscountIds: string[] = [];

afterAll(async () => {
  // Reihenfolge: Einlösungen -> Buchungen -> Rabatte -> Angebote.
  if (createdDiscountIds.length > 0) {
    await db
      .delete(discountRedemptions)
      .where(inArray(discountRedemptions.discountId, createdDiscountIds));
  }
  if (createdBookingIds.length > 0) {
    await db.delete(bookings).where(inArray(bookings.id, createdBookingIds));
  }
  if (createdDiscountIds.length > 0) {
    await db.delete(discounts).where(inArray(discounts.id, createdDiscountIds));
  }
  if (createdOfferIds.length > 0) {
    await db.delete(offers).where(inArray(offers.id, createdOfferIds));
  }
});

describe('applyRedemption (Integration)', () => {
  it('löst einen Code-Rabatt genau einmal ein und sperrt die zweite Einlösung', async () => {
    // Angebot mit Basispreis 25000 Rappen.
    const [offer] = await db
      .insert(offers)
      .values({
        name: 'Rabatt-Test-Angebot',
        priceRappen: 25000,
        unit: 'pauschal',
        sortOrder: 999,
        active: true,
      })
      .returning();
    createdOfferIds.push(offer.id);

    // Code-Rabatt: 20 %, einmal einlösbar.
    const [discount] = await db
      .insert(discounts)
      .values({
        kind: 'code',
        code: `TEST20_${Date.now()}`,
        valueType: 'percent',
        value: 20,
        maxRedemptions: 1,
        redemptionsUsed: 0,
        active: true,
      })
      .returning();
    createdDiscountIds.push(discount.id);

    // Echte Test-Buchung.
    const [booking] = await db
      .insert(bookings)
      .values({
        offerId: offer.id,
        offerNameSnapshot: offer.name,
        customerName: 'Rabatt Kundin',
        customerEmail: 'rabatt@example.ch',
        requestedDate: '2026-06-25',
        priceRappen: offer.priceRappen,
        source: 'manuell',
      })
      .returning();
    createdBookingIds.push(booking.id);

    // Vorschau ist read-only und ändert nichts.
    const preview = await findRedeemable({ code: discount.code!, offerId: offer.id });
    expect('error' in preview).toBe(false);
    if (!('error' in preview)) {
      expect(preview.effectiveRappen).toBe(20000);
      expect(preview.savedRappen).toBe(5000);
    }

    // Erste Einlösung: effektiv 20000, gespart 5000.
    const first = await applyRedemption({
      discountId: discount.id,
      bookingId: booking.id,
      offerId: offer.id,
      baseRappen: offer.priceRappen,
    });
    expect('error' in first).toBe(false);
    if (!('error' in first)) {
      expect(first.effectiveRappen).toBe(20000);
      expect(first.savedRappen).toBe(5000);
    }

    // redemptionsUsed = 1, genau eine Einlösungs-Zeile.
    const afterFirst = await db
      .select()
      .from(discounts)
      .where(eq(discounts.id, discount.id))
      .limit(1);
    expect(afterFirst[0].redemptionsUsed).toBe(1);

    const redemptionsAfterFirst = await db
      .select()
      .from(discountRedemptions)
      .where(eq(discountRedemptions.discountId, discount.id));
    expect(redemptionsAfterFirst).toHaveLength(1);
    expect(redemptionsAfterFirst[0].amountSavedRappen).toBe(5000);

    // Zweite Einlösung: Fehler (aufgebraucht), nichts wird geschrieben.
    const second = await applyRedemption({
      discountId: discount.id,
      bookingId: booking.id,
      offerId: offer.id,
      baseRappen: offer.priceRappen,
    });
    expect('error' in second).toBe(true);

    // redemptionsUsed bleibt 1, keine zweite Einlösungs-Zeile.
    const afterSecond = await db
      .select()
      .from(discounts)
      .where(eq(discounts.id, discount.id))
      .limit(1);
    expect(afterSecond[0].redemptionsUsed).toBe(1);

    const redemptionsAfterSecond = await db
      .select()
      .from(discountRedemptions)
      .where(eq(discountRedemptions.discountId, discount.id));
    expect(redemptionsAfterSecond).toHaveLength(1);
  });
});
