import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { adminUsers, sessions } from '@/db/schema';
import { hashPassword } from './password';
import { createSession, validateSessionToken, invalidateSession } from './session';

async function makeUser() {
  const [u] = await db.insert(adminUsers)
    .values({ email: `t${Date.now()}@x.ch`, passwordHash: await hashPassword('pw12345') })
    .returning();
  return u;
}

describe('session', () => {
  beforeEach(async () => { await db.delete(sessions); });

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
});
