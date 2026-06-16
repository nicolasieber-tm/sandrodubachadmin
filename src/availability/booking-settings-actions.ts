'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { setMaxAdvanceMonths } from './booking-settings-repository';

type ActionResult = { ok: true } | { error: string };

// 0–36 Monate; 0 = unbegrenzt (wird als null gespeichert). 36 als Sanity-Limit
// gegen Tippfehler.
const schema = z.object({
  months: z.coerce.number().int().min(0).max(36),
});

export async function saveBookingHorizonAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // Leeres Feld → 0 (= unbegrenzt).
  const raw = String(formData.get('months') ?? '').trim();
  const parsed = schema.safeParse({ months: raw === '' ? 0 : raw });
  if (!parsed.success) {
    return { error: 'Bitte eine ganze Zahl zwischen 0 und 36 eingeben.' };
  }

  const months = parsed.data.months === 0 ? null : parsed.data.months;
  await setMaxAdvanceMonths(months);
  await logAudit({ action: 'booking_settings.updated' });
  revalidatePath('/admin/kalender');
  revalidatePath('/book');
  return { ok: true };
}
