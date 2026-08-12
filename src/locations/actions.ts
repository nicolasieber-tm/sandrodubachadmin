'use server';

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import {
  createLocation,
  updateLocation,
  setLocationActive,
  listAllLocations,
} from './repository';
import { locationSchema } from './location-input';

type ActionResult = { ok: true } | { error: string };

function revalidateLocationViews(): void {
  revalidatePath('/admin/standorte');
  revalidatePath('/admin/angebote');
  revalidatePath('/book');
}

// Slug aus dem Namen ableiten (z. B. "Horn" -> "horn"), Umlaute vereinfacht.
// Bei Kollision wird eine laufende Nummer angehängt.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'standort';
}

async function uniqueSlug(name: string, ignoreId?: string): Promise<string> {
  const base = slugify(name);
  const existing = await listAllLocations();
  const taken = new Set(existing.filter((l) => l.id !== ignoreId).map((l) => l.slug));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

function parseLocationForm(formData: FormData) {
  return locationSchema.safeParse({
    name: formData.get('name'),
    addressLine1: formData.get('addressLine1') ?? undefined,
    postalCode: formData.get('postalCode') ?? undefined,
    city: formData.get('city') ?? undefined,
    notifyEmail: formData.get('notifyEmail') ?? undefined,
    active: formData.get('active') === 'on' || formData.get('active') === 'true',
  });
}

export async function createLocationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseLocationForm(formData);
  if (!parsed.success) {
    return { error: 'Bitte Eingaben prüfen.' };
  }
  const data = parsed.data;
  const slug = await uniqueSlug(data.name);

  const location = await createLocation({
    name: data.name,
    slug,
    addressLine1: data.addressLine1,
    postalCode: data.postalCode,
    city: data.city,
    notifyEmail: data.notifyEmail,
    active: data.active,
  });

  await logAudit({ action: 'location.created', entity: 'location', entityId: location.id });
  revalidateLocationViews();
  return { ok: true };
}

export async function updateLocationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get('id');
  if (typeof id !== 'string' || id === '') {
    return { error: 'Standort nicht gefunden.' };
  }

  const parsed = parseLocationForm(formData);
  if (!parsed.success) {
    return { error: 'Bitte Eingaben prüfen.' };
  }
  const data = parsed.data;

  const updated = await updateLocation(id, {
    name: data.name,
    addressLine1: data.addressLine1,
    postalCode: data.postalCode,
    city: data.city,
    notifyEmail: data.notifyEmail,
    active: data.active,
  });

  if (!updated) {
    return { error: 'Standort nicht gefunden.' };
  }

  await logAudit({ action: 'location.updated', entity: 'location', entityId: id });
  revalidateLocationViews();
  return { ok: true };
}

export async function toggleLocationAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const updated = await setLocationActive(id, active);
  if (!updated) {
    return { error: 'Standort nicht gefunden.' };
  }
  await logAudit({
    action: active ? 'location.activated' : 'location.deactivated',
    entity: 'location',
    entityId: id,
  });
  revalidateLocationViews();
  return { ok: true };
}
