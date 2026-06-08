import { hash, verify } from '@node-rs/argon2';

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
