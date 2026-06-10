'use server';

import { revalidatePath } from 'next/cache';
import { getOffer } from '@/offers/repository';
import { logAudit } from '@/lib/audit';
import {
  notifyBookingConfirmed,
  notifyBookingCancelled,
  notifyBookingRescheduled,
} from '@/notify';
import {
  createBooking,
  getBooking,
  setBookingStatus,
  updateBookingDetails as updateBookingDetailsRepo,
} from './repository';
import { canTransition, type BookingStatusValue } from './status';
import { manualBookingSchema, updateBookingSchema } from './booking-input';
import { parseAnswers } from '@/offers/custom-fields';
import { pushBookingToGoogle, removeBookingFromGoogle } from '@/google/sync';

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
  const updated = await setBookingStatus(id, ziel);
  await logAudit({ action: `booking.${ziel}`, entity: 'booking', entityId: id });

  // Status-Mail an die Kundin/den Kunden. `erledigt` löst bewusst keine Mail aus.
  if (updated) {
    if (ziel === 'bestaetigt') {
      await notifyBookingConfirmed(updated);
    } else if (ziel === 'abgesagt') {
      await notifyBookingCancelled(updated);
    }
  }

  // Google-Kalender synchronisieren. Eigener try/catch: das Bestätigen/Absagen
  // darf NICHT scheitern, wenn Google nicht konfiguriert ist oder ein Fehler
  // auftritt. Die Sync-Funktionen werfen ohnehin nicht – dies ist die Garantie.
  if (updated) {
    try {
      if (ziel === 'bestaetigt') {
        await pushBookingToGoogle(updated);
      } else if (ziel === 'abgesagt') {
        await removeBookingFromGoogle(updated);
      }
    } catch (err) {
      console.warn('[google] Sync nach Statuswechsel fehlgeschlagen:', err);
    }
  }

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

  const cf = parseAnswers(offer?.customFields ?? [], formData);
  if (!cf.ok) {
    return { error: cf.error };
  }

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
    customFields: cf.answers,
  });

  await logAudit({ action: 'booking.manuell', entity: 'booking' });
  revalidateBookingViews();
  return { ok: true };
}

/**
 * Bearbeitet eine bestehende Buchung – aktuell das Verschieben von Datum/Zeit
 * (+ optional Ort). Gemeinsame Bearbeitungs-Achse: Step 4 ergänzt den Preis,
 * Step 5 Wegkosten/Zusatzminuten (Schema schrittweise erweitern, dann hier die
 * zusätzlichen Felder aus parsed.data an updateBookingDetailsRepo übergeben).
 *
 * Erlaubt nur in den Status 'neu' und 'bestaetigt'. Nach dem Update:
 *  - Status 'bestaetigt' → Google-Event verschieben (pushBookingToGoogle, idempotent).
 *  - notifyCustomer → Verschiebe-Mail an die Kundin/den Kunden.
 */
export async function updateBookingDetails(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const current = await getBooking(id);
  if (!current) {
    return { error: 'Buchung nicht gefunden.' };
  }
  if (current.status !== 'neu' && current.status !== 'bestaetigt') {
    return { error: 'In diesem Status kann der Termin nicht bearbeitet werden.' };
  }

  const parsed = updateBookingSchema.safeParse({
    requestedDate: formData.get('requestedDate'),
    requestedTime: formData.get('requestedTime'),
    location: formData.get('location'),
    priceChf: formData.get('priceChf'),
    travelCostChf: formData.get('travelCostChf'),
    extraMinutes: formData.get('extraMinutes'),
    notifyCustomer: formData.get('notifyCustomer'),
  });

  if (!parsed.success) {
    return { error: 'Bitte Eingaben prüfen.' };
  }

  const data = parsed.data;
  // Preis-/Wegkosten-Eingabe in CHF -> Rappen (Konvention: Geld in Rappen).
  const neuerPreisRappen = Math.round(data.priceChf * 100);
  const alterPreisRappen = current.priceRappen;
  const neueWegkostenRappen = Math.round(data.travelCostChf * 100);
  const alteWegkostenRappen = current.travelCostRappen;
  // Wurde der Termin zeitlich verschoben? Dann den 48h-Reminder-Status
  // zuruecksetzen, damit fuer den neuen Zeitpunkt erneut erinnert wird.
  const terminVerschoben =
    data.requestedDate !== current.requestedDate ||
    data.requestedTime !== current.requestedTime;
  const updated = await updateBookingDetailsRepo(id, {
    requestedDate: data.requestedDate,
    requestedTime: data.requestedTime,
    location: data.location,
    priceRappen: neuerPreisRappen,
    travelCostRappen: neueWegkostenRappen,
    extraMinutes: data.extraMinutes,
    ...(terminVerschoben ? { reminderSentAt: null } : {}),
  });

  if (!updated) {
    return { error: 'Buchung nicht gefunden.' };
  }

  // Audit-Meta haelt Preis- und Wegkosten-Aenderung fest (Nachvollziehbarkeit
  // bei Entgegenkommen/Rabatt): alter und neuer Betrag jeweils in Rappen.
  await logAudit({
    action: 'booking.verschoben',
    entity: 'booking',
    entityId: id,
    meta: {
      alterPreisRappen,
      neuerPreisRappen,
      alteWegkostenRappen,
      neueWegkostenRappen,
    },
  });

  // Google-Kalender synchronisieren. Eigener try/catch wie bei transition():
  // pushBookingToGoogle ist idempotent und verschiebt das bestehende Event.
  // Nur bei bestätigten Terminen existiert ein Google-Event.
  if (updated.status === 'bestaetigt') {
    try {
      await pushBookingToGoogle(updated);
    } catch (err) {
      console.warn('[google] Sync nach Verschieben fehlgeschlagen:', err);
    }
  }

  // Optionale Verschiebe-Mail an die Kundin/den Kunden.
  if (data.notifyCustomer) {
    await notifyBookingRescheduled(updated);
  }

  revalidateBookingViews();
  return { ok: true };
}
