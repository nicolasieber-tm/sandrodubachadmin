import { describe, it, expect, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { adminUsers, sessions } from '@/db/schema';
import { hashPassword } from './password';
import { SESSION_TTL_MS } from './session-config';
import { createSession, validateSessionToken, invalidateSession } from './session';

// Tests laufen gegen die Live-DB (Projekt-Konvention). Deshalb NIE ganze
// Tabellen leeren – ein globales delete(sessions) hat bei jedem Testlauf alle
// echten Admin-Sessions gelöscht und Nutzer zwangsweise abgemeldet. Stattdessen
// werden nur die selbst angelegten Test-User entfernt (Cascade räumt deren
// Sessions mit ab) – gleiches Muster wie in repository.test.ts/redeem.test.ts.
const createdUserIds: string[] = [];

async function makeUser() {
  const [u] = await db.insert(adminUsers)
    .values({ email: `t${Date.now()}@x.ch`, passwordHash: await hashPassword('pw12345') })
    .returning();
  createdUserIds.push(u.id);
  return u;
}

describe('session', () => {
  afterAll(async () => {
    if (createdUserIds.length) {
      await db.delete(adminUsers).where(inArray(adminUsers.id, createdUserIds));
    }
  });

  it('creates a session and validates its token', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    const result = await validateSessionToken(token);
    expect(result?.user.id).toBe(u.id);
  });

  it('returns null for an invalid token', async () => {
    expect(await validateSessionToken('nope')).toBeNull();
  });

  it('invalidates a session', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    await invalidateSession(token);
    expect(await validateSessionToken(token)).toBeNull();
  });

  it('rejects an expired session', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, -1000);
    expect(await validateSessionToken(token)).toBeNull();
  });

  it('extends a session that is near expiry (rolling session)', async () => {
    const u = await makeUser();
    // 1 Tag Restlaufzeit -> klar unter der Verlaengerungsschwelle (halbe TTL),
    // aber sicher nicht abgelaufen (keine Flakiness durch DB-Latenz).
    const { token, expiresAt: before } = await createSession(u.id, 1000 * 60 * 60 * 24);
    const result = await validateSessionToken(token);
    expect(result).not.toBeNull();
    // Auf rund die volle TTL verlaengert ...
    expect(result!.session.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000);
    // ... und der neue Ablauf liegt deutlich nach dem alten.
    expect(result!.session.expiresAt.getTime()).toBeGreaterThan(before.getTime());
    // Auch in der DB persistiert (nicht nur im Rueckgabeobjekt). Gezielt die
    // Session DIESES Test-Users laden – die Tabelle enthält auch echte Sessions.
    const persisted = (await db.select().from(sessions).where(eq(sessions.userId, u.id)))[0];
    expect(persisted.expiresAt.getTime()).toEqual(result!.session.expiresAt.getTime());
  });

  it('does not extend a fresh session', async () => {
    const u = await makeUser();
    const { token, expiresAt } = await createSession(u.id); // volle TTL
    const result = await validateSessionToken(token);
    // Restlaufzeit > halbe TTL -> kein Verlaengern, Ablauf bleibt (quasi) gleich.
    expect(Math.abs(result!.session.expiresAt.getTime() - expiresAt.getTime())).toBeLessThan(1000);
  });
});
