'use server';

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { createDiscount, setDiscountActive, deleteDiscount } from './repository';
import { codeSchema, linkSchema } from './discount-input';

type ActionResult = { ok: true } | { error: string };

// Rohwert (CHF bei fixed, Prozent bei percent) in den gespeicherten Wert
// umrechnen: fixed → Rappen, percent → unverändert.
function toStoredValue(valueType: 'percent' | 'fixed', value: number): number {
  return valueType === 'fixed' ? Math.round(value * 100) : Math.round(value);
}

export async function createCodeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = codeSchema.safeParse({
    code: formData.get('code'),
    valueType: formData.get('valueType'),
    value: formData.get('value'),
    offerId: formData.get('offerId'),
    validUntil: formData.get('validUntil'),
    maxRedemptions: formData.get('maxRedemptions') || undefined,
  });

  if (!parsed.success) {
    return { error: 'Bitte Eingaben prüfen.' };
  }

  const data = parsed.data;

  try {
    const discount = await createDiscount({
      kind: 'code',
      code: data.code,
      valueType: data.valueType,
      value: toStoredValue(data.valueType, data.value),
      offerId: data.offerId,
      validUntil: data.validUntil,
      maxRedemptions: data.maxRedemptions ?? null,
      active: true,
    });

    await logAudit({
      action: 'discount.code_created',
      entity: 'discount',
      entityId: discount.id,
    });
    revalidatePath('/admin/angebote');
    return { ok: true };
  } catch {
    // Wahrscheinlichster Fall: Code bereits vergeben (unique-Verletzung).
    return { error: 'Dieser Code ist bereits vergeben.' };
  }
}

export async function createLinkAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = linkSchema.safeParse({
    label: formData.get('label'),
    offerId: formData.get('offerId'),
    valueType: formData.get('valueType'),
    value: formData.get('value'),
  });

  if (!parsed.success) {
    return { error: 'Bitte Eingaben prüfen.' };
  }

  const data = parsed.data;

  try {
    // Das Repository setzt für kind='link' selbst token + maxRedemptions=1.
    const discount = await createDiscount({
      kind: 'link',
      label: data.label,
      offerId: data.offerId,
      valueType: data.valueType,
      value: toStoredValue(data.valueType, data.value),
    });

    await logAudit({
      action: 'discount.link_created',
      entity: 'discount',
      entityId: discount.id,
    });
    revalidatePath('/admin/angebote');
    return { ok: true };
  } catch {
    return { error: 'Link konnte nicht erstellt werden.' };
  }
}

export async function toggleDiscountAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const updated = await setDiscountActive(id, active);
  if (!updated) {
    return { error: 'Rabatt nicht gefunden.' };
  }
  await logAudit({
    action: active ? 'discount.activated' : 'discount.deactivated',
    entity: 'discount',
    entityId: id,
  });
  revalidatePath('/admin/angebote');
  return { ok: true };
}

export async function deleteDiscountAction(id: string): Promise<ActionResult> {
  const ok = await deleteDiscount(id);
  if (!ok) {
    return { error: 'Rabatt nicht gefunden.' };
  }
  await logAudit({
    action: 'discount.deleted',
    entity: 'discount',
    entityId: id,
  });
  revalidatePath('/admin/angebote');
  return { ok: true };
}
