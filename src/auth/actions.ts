'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminUsers } from '@/db/schema';
import { env } from '@/env';
import { safeEqual } from '@/lib/password';
import { validateSessionToken } from '@/lib/session';
import { setSessionCookie, clearSessionCookie } from './session-cookie';
import { logAudit } from '@/lib/audit';

const COOKIE = env.SESSION_COOKIE_NAME;

// Platzhalter fuer das NOT-NULL-Feld passwordHash. Der Login laeuft ueber die
// Umgebungsvariablen (ADMIN_EMAIL/ADMIN_PASSWORD); der DB-Datensatz traegt kein
// echtes Passwort und dient nur als Anker fuer Session-Bindung und Audit.
// Dieser Wert ist KEIN gueltiger Argon2-Hash und kann nie verifiziert werden.
const ENV_MANAGED_MARKER = '__env_managed__';

/**
 * Liefert den DB-Datensatz fuer den per ENV konfigurierten Admin und legt ihn
 * beim ersten Login automatisch an. So bleibt der Session-/Audit-Apparat
 * unveraendert, obwohl das Passwort aus der Umgebung kommt.
 */
async function getOrCreateEnvAdmin(email: string) {
  const existing = (await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1))[0];
  if (existing) return existing;
  const [created] = await db
    .insert(adminUsers)
    .values({ email, passwordHash: ENV_MANAGED_MARKER })
    .returning();
  return created;
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  const adminEmail = env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    // Login serverseitig nicht konfiguriert — kein Zugang moeglich.
    await logAudit({ action: 'login.fail', meta: { reason: 'env_missing' } });
    return { error: 'Login ist nicht konfiguriert. Bitte ADMIN_EMAIL und ADMIN_PASSWORD setzen.' };
  }

  // Beide Faktoren immer vergleichen (kein Short-Circuit), damit die Dauer nicht
  // verraet, ob die E-Mail oder das Passwort falsch war.
  const emailOk = safeEqual(email, adminEmail);
  const passOk = safeEqual(password, adminPassword);
  if (!emailOk || !passOk) {
    await logAudit({ action: 'login.fail' });
    return { error: 'E-Mail oder Passwort ist falsch.' };
  }

  const user = await getOrCreateEnvAdmin(adminEmail);
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
  await setSessionCookie(user.id);
  await logAudit({ actor: user.id, action: 'login.success' });
  redirect('/admin');
}

export async function logoutAction() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    const res = await validateSessionToken(token);
    if (res) await logAudit({ actor: res.user.id, action: 'logout' });
  }
  await clearSessionCookie();
  redirect('/login');
}
