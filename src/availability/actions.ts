'use server';

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { updateAvailability, type AvailabilityRow } from './repository';
import { availabilitySchema } from './input';

type ActionResult = { ok: true } | { error: string };

// Wochentag-Konvention: 0=Montag … 6=Sonntag.
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

// Liest die sieben Zeilen aus dem FormData. Felder pro Wochethag:
// `enabled-{weekday}` (Checkbox, nur vorhanden wenn aktiv),
// `start-{weekday}` und `end-{weekday}` (Zeit-Strings).
function readRows(formData: FormData): AvailabilityRow[] {
  return WEEKDAYS.map((weekday) => ({
    weekday,
    // Eine nicht angehakte Checkbox sendet KEINEN Wert -> deaktiviert.
    enabled: formData.get(`enabled-${weekday}`) !== null,
    startTime: String(formData.get(`start-${weekday}`) ?? ''),
    endTime: String(formData.get(`end-${weekday}`) ?? ''),
  }));
}

export async function saveAvailabilityAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const rows = readRows(formData);

  const parsed = availabilitySchema.safeParse({ rows });
  if (!parsed.success) {
    return { error: 'Bitte Zeiten prüfen.' };
  }

  await updateAvailability(parsed.data.rows);
  await logAudit({ action: 'availability.updated' });
  revalidatePath('/admin/kalender');
  return { ok: true };
}
