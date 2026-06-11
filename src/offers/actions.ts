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
import { customFieldsDefSchema, type CustomFieldDef } from './custom-fields';

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
    durationMinutes: formData.get('durationMinutes'),
    description: formData.get('description'),
    bookingMode: formData.get('bookingMode') ?? undefined,
    travelRuleId: formData.get('travelRuleId') ?? undefined,
    active: checkboxToBool(formData.get('active')),
  });
}

// Liest die als JSON serialisierte Felddefinition aus dem Formular und prüft
// sie server-autoritativ. Rückgabe null = ungültig (Action soll abbrechen).
function parseCustomFieldsField(formData: FormData): CustomFieldDef[] | null {
  const raw = formData.get('customFields');
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = customFieldsDefSchema.safeParse(json);
  return parsed.success ? (parsed.data as CustomFieldDef[]) : null;
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

  const customFields = parseCustomFieldsField(formData);
  if (customFields === null) {
    return { error: 'Zusätzliche Abfragen sind ungültig.' };
  }

  const offer = await createOffer({
    name: data.name,
    priceRappen: Math.round(data.priceChf * 100),
    unit: data.unit,
    durationMinutes: data.durationMinutes,
    description: data.description,
    bookingMode: data.bookingMode,
    travelRuleId: data.travelRuleId,
    active: data.active,
    customFields,
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

  const customFields = parseCustomFieldsField(formData);
  if (customFields === null) {
    return { error: 'Zusätzliche Abfragen sind ungültig.' };
  }

  const updated = await updateOffer(id, {
    name: data.name,
    priceRappen: Math.round(data.priceChf * 100),
    unit: data.unit,
    durationMinutes: data.durationMinutes,
    description: data.description,
    bookingMode: data.bookingMode,
    travelRuleId: data.travelRuleId,
    active: data.active,
    customFields,
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
