'use server';

import { getOffer } from '@/offers/repository';
import { getLocation } from '@/locations/repository';
import { logAudit } from '@/lib/audit';
import { findRedeemable, applyRedemption } from '@/discounts/redeem';
import {
  notifyBookingReceived,
  notifyAdminNewBooking,
} from '@/notify';
import { createBooking, updateBookingPricing } from './repository';
import { publicBookingSchema } from './public-input';
import { resolveBookingLocation } from './location-gate';
import { parseAnswers } from '@/offers/custom-fields';
import { resolveStandardFields } from '@/offers/standard-fields';
import { getMaxAdvanceMonths } from '@/availability/booking-settings-repository';
import { isWithinHorizon } from '@/availability/booking-horizon';

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
    // Nur Feldnamen + Fehlercodes loggen (keine Kundendaten): macht
    // Validierungsfehler der Buchungsstrecke in den Railway-Logs sichtbar.
    console.error(
      '[booking] Validierung fehlgeschlagen:',
      parsed.error.issues.map((i) => `${i.path.map(String).join('.')}:${i.code}`).join(', '),
    );
    return { error: 'Bitte überprüfe deine Eingaben.' };
  }

  const data = parsed.data;

  const offer = await getOffer(data.offerId);
  if (!offer || !offer.active) {
    return { error: 'Dieses Angebot ist nicht mehr verfügbar.' };
  }

  // Praxis-Standort der Buchung: IMMER serverseitig aus offer.locationId
  // auflösen (nie aus einem Client-Feld). Ein evtl. vom Client mitgeschicktes
  // Standort-Feld hat auf diesen Wert keinerlei Einfluss — es gibt in diesem
  // Formular auch keins (die Auswahl auf der Standort-Karte bestimmt nur, welche
  // Angebote angezeigt werden). Angebot ohne locationId = Altpfad (kein Standort).
  // Zeigt offer.locationId auf einen unbekannten oder deaktivierten Standort,
  // wird die Buchung abgelehnt, statt sie mit einem falschen/leeren Standort
  // anzulegen.
  const location = offer.locationId ? await getLocation(offer.locationId) : null;
  const locationResolution = resolveBookingLocation(offer.locationId, location);
  if (!locationResolution.ok) {
    return { error: locationResolution.error };
  }
  const { locationId, locationNameSnapshot } = locationResolution;

  // Anfrage-Modus (individuelles Shooting): Ideen-Beschreibung ist Pflicht,
  // der Wunschtermin optional (wird gespeichert, falls gewählt — verbindlich
  // erst mit Sandros Bestätigung). Termin-Modus: Datum bleibt Pflicht.
  const istAnfrage = offer.bookingMode === 'anfrage';
  if (istAnfrage) {
    if (data.message.trim() === '') {
      return { error: 'Bitte beschreibe kurz deine Idee.' };
    }
  } else {
    if (data.requestedDate.trim() === '') {
      return { error: 'Bitte wähle einen Termin.' };
    }
    // Buchungshorizont auch serverseitig erzwingen (falls das Frontend
    // umgangen wird). null = unbegrenzt.
    const months = await getMaxAdvanceMonths();
    if (months !== null && !isWithinHorizon(data.requestedDate, new Date(), months)) {
      return {
        error: `Termine können höchstens ${months} Monate im Voraus gebucht werden.`,
      };
    }
  }

  // Telefon nur erzwingen, wenn das Feld bei diesem Angebot sichtbar ist.
  const sf = resolveStandardFields(offer.standardFields);
  if (sf.phone.visible && sf.phone.required && data.customerPhone.trim().length < 6) {
    return { error: 'Bitte gib deine Telefonnummer an.' };
  }

  // Ort als feste Auswahl: Wert muss eine der konfigurierten Optionen sein
  // (Auswahl ist Pflicht — feste Orte konfiguriert man nur, wenn die Angabe
  // für die Durchführung gebraucht wird). Deckt auch leere Werte ab.
  if (sf.location.visible && sf.location.mode === 'select' && !sf.location.options.includes(data.location)) {
    return { error: 'Bitte wähle einen Ort aus.' };
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
    requestedDate: data.requestedDate.trim() === '' ? null : data.requestedDate,
    requestedTime: data.requestedTime,
    location: data.location,
    locationId,
    locationNameSnapshot,
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
