import { hash, verify } from '@node-rs/argon2';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-Time-Vergleich zweier Strings (gegen Timing-Enumeration). Beide
 * Seiten werden zuerst auf 32 Byte gehasht, damit weder Inhalt noch
 * Laengenunterschiede ueber die Vergleichsdauer durchsickern. Fuer den
 * Abgleich von Login-Daten aus den Umgebungsvariablen.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

// OWASP 2026: Argon2id, m=64 MiB, t=3, p=1
const OPTS = { memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
