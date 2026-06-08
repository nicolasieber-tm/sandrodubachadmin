import { cookies } from 'next/headers';
import { env } from '@/env';
import { validateSessionToken } from '@/lib/session';

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const res = await validateSessionToken(token);
  return res?.user ?? null;
}
