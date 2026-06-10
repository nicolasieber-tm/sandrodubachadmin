'use server';

import { getOffer } from '@/offers/repository';
import { logAudit } from '@/lib/audit';
import { findRedeemable, applyRedemption } from '@/discounts/redeem';
import {
  notifyBookingReceived,
  notifyAdminNewBooking,
} from '@/notify';
import { createBooking, updateBookingPricing } from './repository';
import { publicBookingSchema } from './public-input';
import { parseAnswers } from '@/offers/custom-fields';

export type PublicActionResult = { ok: true } | { error: string };

export type PreviewResult =
  | { effectiveRappen: number; savedRappen: number }
  | { error: string };

/**
 * Read-only-Vorschau eines Rabatt-Codes für die Buchungsstrecke. Berechnet den
 * reduzierten Preis serverseitig aus dem Basispreis des Angebots (nicht aus dem
 * Client). Bei ungültigem Code wird eine deutsche Meldung zurückgegeben.
 */
export async function previewDiscount(
  code: string,
  offerId: string,
): Promise<PreviewResult> {
  const trimmed = code.trim();
  if (trimmed === '') {
    return { error: 'Bitte einen Rabatt-Code eingeben.' };
  }

  const result = await findRedeemable({ code: trimmed, offerId, now: new Date() });
  if ('error' in result) {
    return { error: result.error };
  }
  return {
    effectiveRappen: result.effectiveRappen,
    savedRappen: result.savedRappen,
  };
}

/**
 * Nimmt eine öffentliche Buchungsanfrage aus der iframe-Strecke entgegen.
 * Bewusst minimal vertrauend: Preis und Angebotsname kommen serverseitig aus
 * dem Angebot, nicht aus dem Formular.
 *
 * Rabatt-Einlösung (Reihenfolge):
 * 1. Angebot validieren → Basispreis steht fest.
 * 2. Falls Code oder Token gesetzt: `findRedeemable` (read-only) prüfen.
 *    - Ungültiger CODE → { error } zurück, Kunde kann korrigieren.
 *    - Ungültiges TOKEN (Link evtl. schon verbraucht) → zum Basispreis weiter.
 * 3. Buchung mit effektivem Preis + discountId anlegen.
 * 4. `applyRedemption` (transaktional, FOR UPDATE) einlösen. Bei Fehler
 *    (Wettlauf/aufgebraucht zwischen Vorschau und Einlösung) → Buchung auf
 *    Basispreis korrigieren und discountId entfernen.
 */
export async function submitBookingRequest(
  _prev: PublicActionResult | null,
  formData: FormData,
): Promise<PublicActionResult> {
  // Honeypot: ausgefülltes Feld → wie Erfolg tun, aber nichts speichern.
  const honeypot = formData.get('website');
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    await logAudit({ action: 'booking.spam_blocked' });
    return { ok: true };
  }

  const parsed = publicBookingSchema.safeParse({
    offerId: formData.get('offerId'),
    customerName: formData.get('customerName'),
    customerEmail: formData.get('customerEmail'),
    customerPhone: formData.get('customerPhone'),
    requestedDate: formData.get('requestedDate'),
    requestedTime: formData.get('requestedTime'),
    location: formData.get('location'),
    message: formData.get('message'),
    code: formData.get('code'),
    token: formData.get('token'),
    website: formData.get('website'),
  });

  if (!parsed.success) {
    return { error: 'Bitte überprüfe deine Eingaben.' };
  }

  const data = parsed.data;

  const offer = await getOffer(data.offerId);
  if (!offer || !offer.active) {
    return { error: 'Dieses Angebot ist nicht mehr verfügbar.' };
  }

  const cf = parseAnswers(offer.customFields, formData);
  if (!cf.ok) {
    return { error: cf.error };
  }

  const now = new Date();
  const code = data.code.trim();
  const token = data.token.trim();

  // Einlösbarkeit vorab prüfen (read-only). Token hat Vorrang vor Code.
  let priceRappen = offer.priceRappen;
  let discountId: string | null = null;
  if (token !== '' || code !== '') {
    const redeemable = await findRedeemable({
      token: token !== '' ? token : undefined,
      code: code !== '' ? code : undefined,
      offerId: offer.id,
      now,
    });

    if ('error' in redeemable) {
      // Ungültiger Code → Kunde soll korrigieren können.
      // Ungültiges Token (Link evtl. schon verbraucht) → zum Basispreis weiter.
      if (code !== '') {
        return { error: 'Rabatt-Code ungültig.' };
      }
    } else {
      priceRappen = redeemable.effectiveRappen;
      discountId = redeemable.discount.id;
    }
  }

  const booking = await createBooking({
    offerId: offer.id,
    offerNameSnapshot: offer.name,
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone,
    message: data.message,
    requestedDate: data.requestedDate,
    requestedTime: data.requestedTime,
    location: data.location,
    priceRappen,
    discountId,
    source: 'iframe',
    status: 'neu',
    customFields: cf.answers,
  });

  // Rabatt jetzt transaktional einlösen. Bei Wettlauf/aufgebraucht: Buchung
  // auf den Basispreis korrigieren und Verknüpfung entfernen.
  let finalBooking = booking;
  if (discountId) {
    const applied = await applyRedemption({
      discountId,
      bookingId: booking.id,
      offerId: offer.id,
      baseRappen: offer.priceRappen,
      now,
    });
    if ('error' in applied) {
      const corrected = await updateBookingPricing(booking.id, {
        priceRappen: offer.priceRappen,
        discountId: null,
      });
      finalBooking = corrected ?? booking;
      await logAudit({
        action: 'booking.discount_failed',
        entity: 'booking',
        entityId: booking.id,
        meta: { discountId, reason: applied.error },
      });
    } else {
      await logAudit({
        action: 'booking.discount_applied',
        entity: 'booking',
        entityId: booking.id,
        meta: { discountId, savedRappen: applied.savedRappen },
      });
    }
  }

  await notifyBookingReceived(finalBooking);
  await notifyAdminNewBooking(finalBooking);
  await logAudit({ action: 'booking.request', entity: 'booking', entityId: finalBooking.id });

  return { ok: true };
}
