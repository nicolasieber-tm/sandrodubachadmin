'use server';

import { revalidatePath } from 'next/cache';
import { getOffer } from '@/offers/repository';
import { logAudit } from '@/lib/audit';
import {
  createBooking,
  getBooking,
  setBookingStatus,
} from './repository';
import { canTransition, type BookingStatusValue } from './status';
import { manualBookingSchema } from './booking-input';

type ActionResult = { ok: true } | { error: string };

function revalidateBookingViews(): void {
  revalidatePath('/admin');
  revalidatePath('/admin/termine');
}

async function transition(
  id: string,
  ziel: BookingStatusValue,
): Promise<ActionResult> {
  const current = await getBooking(id);
  if (!current) {
    return { error: 'Buchung nicht gefunden.' };
  }
  if (!canTransition(current.status, ziel)) {
    return { error: 'Übergang nicht erlaubt.' };
  }
  await setBookingStatus(id, ziel);
  await logAudit({ action: `booking.${ziel}`, entity: 'booking', entityId: id });
  // TODO Stufe 1b: Mail an Kunde
  revalidateBookingViews();
  return { ok: true };
}

export async function confirmBooking(id: string): Promise<ActionResult> {
  return transition(id, 'bestaetigt');
}

export async function cancelBooking(id: string): Promise<ActionResult> {
  return transition(id, 'abgesagt');
}

export async function completeBooking(id: string): Promise<ActionResult> {
  return transition(id, 'erledigt');
}

export async function createManualBooking(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = manualBookingSchema.safeParse({
    offerId: formData.get('offerId'),
    customerName: formData.get('customerName'),
    customerEmail: formData.get('customerEmail'),
    customerPhone: formData.get('customerPhone'),
    requestedDate: formData.get('requestedDate'),
    requestedTime: formData.get('requestedTime'),
    location: formData.get('location'),
    message: formData.get('message'),
    priceChf: formData.get('priceChf'),
  });

  if (!parsed.success) {
    return { error: 'Bitte Eingaben prüfen.' };
  }

  const data = parsed.data;
  const offer = await getOffer(data.offerId);
  const offerNameSnapshot = offer?.name ?? '';

  await createBooking({
    offerId: data.offerId,
    offerNameSnapshot,
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone,
    message: data.message,
    requestedDate: data.requestedDate,
    requestedTime: data.requestedTime,
    location: data.location,
    priceRappen: Math.round(data.priceChf * 100),
    source: 'manuell',
    status: 'neu',
  });

  await logAudit({ action: 'booking.manuell', entity: 'booking' });
  revalidateBookingViews();
  return { ok: true };
}
