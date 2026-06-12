'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminUsers } from '@/db/schema';
import { env } from '@/env';
import { safeEqual } from '@/lib/password';
import { verifyTotp, consumeRecoveryCode } from '@/lib/totp';
import { validateSessionToken } from '@/lib/session';
import { setSessionCookie, clearSessionCookie } from './session-cookie';
import { logAudit } from '@/lib/audit';

const COOKIE = env.SESSION_COOKIE_NAME;
const secure = process.env.NODE_ENV === 'production';
const pendingOpts = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };

// Platzhalter fuer das NOT-NULL-Feld passwordHash. Der Login laeuft ueber die
// Umgebungsvariablen (ADMIN_EMAIL/ADMIN_PASSWORD), daher traegt der DB-Datensatz
// kein echtes Passwort mehr — er existiert nur als Anker fuer 2FA-Secret,
// Recovery-Codes und Session-Bindung. Dieser Wert ist KEIN gueltiger
// Argon2-Hash und kann niemals verifiziert werden.
const ENV_MANAGED_MARKER = '__env_managed__';

const MAX_2FA_TRIES = 5;

/**
 * Liefert den DB-Datensatz fuer den per ENV konfigurierten Admin und legt ihn
 * beim ersten Login automatisch an. So bleibt der gesamte 2FA-/Session-/Audit-
 * Apparat unveraendert, obwohl das Passwort jetzt aus der Umgebung kommt.
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

  const store = await cookies();

  if (!user.totpEnabled) {
    // KEINE volle Session vor aktivem zweitem Faktor — nur ein kurzlebiges
    // Setup-Pending. Die volle Session entsteht erst nach 2FA-Bestätigung.
    store.set('sd_setup_pending', user.id, { ...pendingOpts, maxAge: 600 });
    redirect('/setup-2fa');
  }

  store.set('sd_2fa_pending', user.id, { ...pendingOpts, maxAge: 300 });
  store.delete('sd_2fa_tries');
  return { needsTotp: true as const };
}

export async function verify2faAction(_prev: unknown, formData: FormData) {
  const store = await cookies();
  const userId = store.get('sd_2fa_pending')?.value;
  if (!userId) return { error: 'Sitzung abgelaufen, bitte erneut anmelden.' };

  const user = (await db.select().from(adminUsers).where(eq(adminUsers.id, userId)).limit(1))[0];
  if (!user || !user.totpSecret) return { error: 'Konto nicht gefunden.' };

  const token = String(formData.get('token') ?? '');
  const recovery = String(formData.get('recovery') ?? '');

  let ok = false;
  if (token) ok = verifyTotp(user.totpSecret, token);
  if (!ok && recovery) {
    const res = await consumeRecoveryCode(user.recoveryCodes, recovery);
    if (res.ok) {
      ok = true;
      await db.update(adminUsers).set({ recoveryCodes: res.remaining }).where(eq(adminUsers.id, user.id));
    }
  }

  if (!ok) {
    const tries = Number(store.get('sd_2fa_tries')?.value ?? '0') + 1;
    await logAudit({ actor: user.id, action: '2fa.fail', meta: { tries } });
    if (tries >= MAX_2FA_TRIES) {
      store.delete('sd_2fa_pending');
      store.delete('sd_2fa_tries');
      return { error: 'Zu viele Fehlversuche. Bitte erneut anmelden.' };
    }
    store.set('sd_2fa_tries', String(tries), { ...pendingOpts, maxAge: 300 });
    return { error: 'Code ungültig.' };
  }

  store.delete('sd_2fa_pending');
  store.delete('sd_2fa_tries');
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
