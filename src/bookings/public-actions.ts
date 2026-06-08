'use server';

import { getOffer } from '@/offers/repository';
import { logAudit } from '@/lib/audit';
import {
  notifyBookingReceived,
  notifyAdminNewBooking,
} from '@/notify';
import { createBooking } from './repository';
import { publicBookingSchema } from './public-input';

export type PublicActionResult = { ok: true } | { error: string };

/**
 * Nimmt eine öffentliche Buchungsanfrage aus der iframe-Strecke entgegen.
 * Bewusst minimal vertrauend: Preis und Angebotsname kommen serverseitig aus
 * dem Angebot, nicht aus dem Formular.
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
    message: formData.get('message'),
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

  const booking = await createBooking({
    offerId: offer.id,
    offerNameSnapshot: offer.name,
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone,
    message: data.message,
    requestedDate: data.requestedDate,
    requestedTime: data.requestedTime,
    priceRappen: offer.priceRappen,
    source: 'iframe',
    status: 'neu',
  });

  await notifyBookingReceived(booking);
  await notifyAdminNewBooking(booking);
  await logAudit({ action: 'booking.request', entity: 'booking', entityId: booking.id });

  return { ok: true };
}
