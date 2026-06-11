'use server';

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import {
  createTravelRule,
  updateTravelRule,
  deleteTravelRule,
} from './repository';
import { travelRuleSchema } from './travel-input';

type ActionResult = { ok: true } | { error: string };

function revalidateTravelViews(): void {
  revalidatePath('/admin/angebote');
  revalidatePath('/book');
}

function parseTravelRuleForm(formData: FormData) {
  return travelRuleSchema.safeParse({
    name: formData.get('name'),
    baseLocation: formData.get('baseLocation'),
    freeRadiusKm: formData.get('freeRadiusKm'),
    ratePerKmChf: formData.get('ratePerKmChf'),
  });
}

export async function createTravelRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseTravelRuleForm(formData);
  if (!parsed.success) {
    return { error: 'Bitte Eingaben prüfen.' };
  }
  const data = parsed.data;

  const rule = await createTravelRule({
    name: data.name,
    baseLocation: data.baseLocation,
    freeRadiusKm: data.freeRadiusKm,
    ratePerKmRappen: Math.round(data.ratePerKmChf * 100),
  });

  await logAudit({ action: 'travelrule.created', entity: 'travel_rule', entityId: rule.id });
  revalidateTravelViews();
  return { ok: true };
}

export async function updateTravelRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get('id');
  if (typeof id !== 'string' || id === '') {
    return { error: 'Regel nicht gefunden.' };
  }

  const parsed = parseTravelRuleForm(formData);
  if (!parsed.success) {
    return { error: 'Bitte Eingaben prüfen.' };
  }
  const data = parsed.data;

  const updated = await updateTravelRule(id, {
    name: data.name,
    baseLocation: data.baseLocation,
    freeRadiusKm: data.freeRadiusKm,
    ratePerKmRappen: Math.round(data.ratePerKmChf * 100),
  });

  if (!updated) {
    return { error: 'Regel nicht gefunden.' };
  }

  await logAudit({ action: 'travelrule.updated', entity: 'travel_rule', entityId: id });
  revalidateTravelViews();
  return { ok: true };
}

export async function deleteTravelRuleAction(id: string): Promise<ActionResult> {
  await deleteTravelRule(id);
  await logAudit({ action: 'travelrule.deleted', entity: 'travel_rule', entityId: id });
  revalidateTravelViews();
  return { ok: true };
}
