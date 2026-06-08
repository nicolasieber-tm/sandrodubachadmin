import { cookies } from 'next/headers';
import { env } from '@/env';
import { createSession, invalidateSession } from '@/lib/session';

const COOKIE = env.SESSION_COOKIE_NAME;
const secure = process.env.NODE_ENV === 'production';

/** Stellt eine volle Admin-Session aus (rotiert eine evtl. bestehende). */
export async function setSessionCookie(userId: string) {
  const store = await cookies();
  const old = store.get(COOKIE)?.value;
  if (old) await invalidateSession(old);
  const { token, expiresAt } = await createSession(userId);
  store.set(COOKIE, token, {
    httpOnly: true, secure, sameSite: 'lax', path: '/', expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await invalidateSession(token);
  store.delete(COOKIE);
}
