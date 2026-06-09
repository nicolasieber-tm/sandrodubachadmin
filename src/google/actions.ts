'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/auth/current-user';
import { logAudit } from '@/lib/audit';
import { deleteGoogleConnection, setBusyCalendarIds, setWriteMode } from '@/google/tokens';

type ActionResult = { ok: true } | { error: string };

/**
 * Trennt die Google-Kalender-Verbindung: loescht die gespeicherte Verbindung
 * (inkl. verschluesselter Tokens), schreibt einen Audit-Eintrag und
 * revalidiert die Kalender-Seite. Nur fuer angemeldete Admins.
 */
export async function disconnectGoogleAction(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Nicht angemeldet.' };
  }

  await deleteGoogleConnection();
  await logAudit({ actor: user.id, action: 'google.disconnected' });
  revalidatePath('/admin/kalender');
  return { ok: true };
}

export async function updateBusyCalendarsAction(ids: string[]): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Nicht angemeldet.' };
  await setBusyCalendarIds(ids);
  await logAudit({ actor: user.id, action: 'google.busy.update', meta: { count: ids.length } });
  revalidatePath('/admin/kalender');
  return { ok: true };
}

export async function updateWriteModeAction(mode: 'main' | 'per_offer'): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Nicht angemeldet.' };
  await setWriteMode(mode);
  await logAudit({ actor: user.id, action: 'google.writemode.update', meta: { mode } });
  revalidatePath('/admin/kalender');
  return { ok: true };
}
