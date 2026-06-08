'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminUsers } from '@/db/schema';
import { env } from '@/env';
import { verifyPassword } from '@/lib/password';
import { verifyTotp, consumeRecoveryCode } from '@/lib/totp';
import {
  createSession, invalidateSession, validateSessionToken,
} from '@/lib/session';
import { logAudit } from '@/lib/audit';

const COOKIE = env.SESSION_COOKIE_NAME;
const secure = process.env.NODE_ENV === 'production';

async function setSessionCookie(userId: string) {
  const store = await cookies();
  const old = store.get(COOKIE)?.value;
  if (old) await invalidateSession(old);
  const { token, expiresAt } = await createSession(userId);
  store.set(COOKIE, token, {
    httpOnly: true, secure, sameSite: 'lax', path: '/', expires: expiresAt,
  });
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  const user = (await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1))[0];
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    await logAudit({ action: 'login.fail', meta: { email } });
    return { error: 'E-Mail oder Passwort ist falsch.' };
  }

  if (!user.totpEnabled) {
    await setSessionCookie(user.id);
    redirect('/setup-2fa');
  }

  const store = await cookies();
  store.set('sd_2fa_pending', user.id, {
    httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 300,
  });
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
    await logAudit({ actor: user.id, action: '2fa.fail' });
    return { error: 'Code ungültig.' };
  }

  store.delete('sd_2fa_pending');
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
    await invalidateSession(token);
    if (res) await logAudit({ actor: res.user.id, action: 'logout' });
  }
  store.delete(COOKIE);
  redirect('/login');
}
