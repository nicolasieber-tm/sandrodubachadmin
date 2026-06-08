'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/auth/current-user';
import { logAudit } from '@/lib/audit';
import { deleteGoogleConnection } from '@/google/tokens';

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
