import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, adminUsers, type AdminUser, type Session } from '@/db/schema';
import { SESSION_TTL_MS } from './session-config';
import { generateToken, sha256Hex } from './tokens';

// Sobald weniger als die Hälfte der Laufzeit übrig ist, wird eine noch gültige
// Session beim Validieren verlängert (rollierende Session). So bleiben aktive
// Nutzer dauerhaft angemeldet, ohne dass die Session pro Request geschrieben wird.
// Verlängert wird stets auf die produktweite Laufzeit (SESSION_TTL_MS); der
// optionale ttlMs-Parameter von createSession steuert nur die *Erst*-Laufzeit
// (genutzt in Tests), nicht den Rhythmus der Verlängerung.
const RENEW_THRESHOLD_MS = SESSION_TTL_MS / 2;

export async function createSession(userId: string, ttlMs = SESSION_TTL_MS) {
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

  const now = Date.now();
  if (found.session.expiresAt.getTime() < now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  // Rollierende Verlängerung: läuft die Session bald aus, schieben wir das
  // Ablaufdatum weiter. Der aktualisierte Wert wandert ins Ergebnis, damit
  // Aufrufer (z. B. das Cookie) den neuen Ablauf übernehmen können.
  if (found.session.expiresAt.getTime() - now < RENEW_THRESHOLD_MS) {
    const expiresAt = new Date(now + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    found.session.expiresAt = expiresAt;
  }

  return found;
}

export async function invalidateSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256Hex(token)));
}

export async function invalidateAllForUser(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
