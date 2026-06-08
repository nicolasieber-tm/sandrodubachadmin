import { generateSecret, generateURI, verifySync } from 'otplib';
import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

const ISSUER = 'Sandro Dubach Admin';

export function createTotpSecret(): string {
  return generateSecret();
}

export function buildOtpAuthUri(account: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: account, secret });
}

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return verifySync({ secret, token: token.trim() }).valid;
  } catch {
    return false;
  }
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const hex = randomBytes(5).toString('hex').toUpperCase();
    return `${hex.slice(0, 5)}-${hex.slice(5)}`;
  });
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => hash(c)));
}

export async function consumeRecoveryCode(
  hashes: string[],
  code: string,
): Promise<{ ok: boolean; remaining: string[] }> {
  for (let i = 0; i < hashes.length; i++) {
    if (await verify(hashes[i], code.trim().toUpperCase())) {
      return { ok: true, remaining: [...hashes.slice(0, i), ...hashes.slice(i + 1)] };
    }
  }
  return { ok: false, remaining: hashes };
}
