'use server';

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import {
  createOffer,
  updateOffer,
  deleteOffer,
  setOfferActive,
} from './repository';
import { offerSchema } from './offer-input';

type ActionResult = { ok: true } | { error: string };

function revalidateOfferViews(): void {
  revalidatePath('/admin/angebote');
  revalidatePath('/book');
}

// Checkbox-Wert eines Formulars in einen Boolean übersetzen.
// Ein nicht angehakter Switch sendet KEINEN Wert -> false.
function checkboxToBool(value: FormDataEntryValue | null): boolean {
  return value === 'on' || value === 'true';
}

function parseOfferForm(formData: FormData) {
  return offerSchema.safeParse({
    name: formData.get('name'),
    priceChf: formData.get('priceChf'),
    unit: formData.get('unit'),
    durationLabel: formData.get('durationLabel'),
    description: formData.get('description'),
    calendarKey: formData.get('calendarKey'),
    active: checkboxToBool(formData.get('active')),
  });
}

export async function createOfferAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseOfferForm(formData);
  if (!parsed.success) {
    return { error: 'Bitte Eingaben prüfen.' };
  }

  const data = parsed.data;
  const calendarKey = data.calendarKey.trim() === '' ? null : data.calendarKey.trim();

  const offer = await createOffer({
    name: data.name,
    priceRappen: Math.round(data.priceChf * 100),
    unit: data.unit,
    durationLabel: data.durationLabel,
    description: data.description,
    calendarKey,
    active: data.active,
  });

  await logAudit({ action: 'offer.created', entity: 'offer', entityId: offer.id });
  revalidateOfferViews();
  return { ok: true };
}

export async function updateOfferAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get('id');
  if (typeof id !== 'string' || id === '') {
    return { error: 'Angebot nicht gefunden.' };
  }

  const parsed = parseOfferForm(formData);
  if (!parsed.success) {
    return { error: 'Bitte Eingaben prüfen.' };
  }

  const data = parsed.data;
  const calendarKey = data.calendarKey.trim() === '' ? null : data.calendarKey.trim();

  const updated = await updateOffer(id, {
    name: data.name,
    priceRappen: Math.round(data.priceChf * 100),
    unit: data.unit,
    durationLabel: data.durationLabel,
    description: data.description,
    calendarKey,
    active: data.active,
  });

  if (!updated) {
    return { error: 'Angebot nicht gefunden.' };
  }

  await logAudit({ action: 'offer.updated', entity: 'offer', entityId: id });
  revalidateOfferViews();
  return { ok: true };
}

export async function deleteOfferAction(id: string): Promise<ActionResult> {
  await deleteOffer(id);
  await logAudit({ action: 'offer.deleted', entity: 'offer', entityId: id });
  revalidateOfferViews();
  return { ok: true };
}

export async function toggleOfferAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const updated = await setOfferActive(id, active);
  if (!updated) {
    return { error: 'Angebot nicht gefunden.' };
  }
  await logAudit({
    action: active ? 'offer.activated' : 'offer.deactivated',
    entity: 'offer',
    entityId: id,
  });
  revalidateOfferViews();
  return { ok: true };
}

// Ordnet einem Angebot einen Kalender (subCalendar-Schlüssel) zu.
// Leerer Schlüssel ('— kein —') hebt die Zuordnung auf (null).
export async function setOfferCalendarAction(
  offerId: string,
  calendarKey: string,
): Promise<{ ok: true }> {
  await updateOffer(offerId, { calendarKey: calendarKey || null });
  await logAudit({
    action: 'offer.calendar_mapped',
    entity: 'offer',
    entityId: offerId,
    meta: { calendarKey: calendarKey || null },
  });
  revalidatePath('/admin/kalender');
  revalidatePath('/admin/angebote');
  return { ok: true };
}
