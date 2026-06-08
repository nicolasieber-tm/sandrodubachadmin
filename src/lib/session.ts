import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, adminUsers, type AdminUser, type Session } from '@/db/schema';
import { generateToken, sha256Hex } from './tokens';

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24; // 24h

export async function createSession(userId: string, ttlMs = DEFAULT_TTL_MS) {
  const token = generateToken();
  const id = sha256Hex(token);
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { token, expiresAt };
}

export async function validateSessionToken(
  token: string,
): Promise<{ session: Session; user: AdminUser } | null> {
  const id = sha256Hex(token);
  const row = await db
    .select({ session: sessions, user: adminUsers })
    .from(sessions)
    .innerJoin(adminUsers, eq(sessions.userId, adminUsers.id))
    .where(eq(sessions.id, id))
    .limit(1);
  const found = row[0];
  if (!found) return null;
  if (found.session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  return found;
}

export async function invalidateSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256Hex(token)));
}

export async function invalidateAllForUser(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
