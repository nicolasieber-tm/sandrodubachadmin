'use server';

import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminUsers } from '@/db/schema';
import { getCurrentUser } from './current-user';
import {
  createTotpSecret, buildOtpAuthUri, verifyTotp,
  generateRecoveryCodes, hashRecoveryCodes,
} from '@/lib/totp';
import { logAudit } from '@/lib/audit';

export async function startTotpSetup(): Promise<{ secret: string; qr: string } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const secret = createTotpSecret();
  await db.update(adminUsers).set({ totpSecret: secret }).where(eq(adminUsers.id, user.id));
  const uri = buildOtpAuthUri(user.email, secret);
  const qr = await QRCode.toDataURL(uri);
  return { secret, qr };
}

export async function confirmTotpSetup(_prev: unknown, formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !user.totpSecret) return { error: 'Keine Einrichtung aktiv.' };
  const token = String(formData.get('token') ?? '');
  if (!verifyTotp(user.totpSecret, token)) return { error: 'Code stimmt nicht.' };

  const codes = generateRecoveryCodes(8);
  const hashes = await hashRecoveryCodes(codes);
  await db.update(adminUsers)
    .set({ totpEnabled: true, recoveryCodes: hashes })
    .where(eq(adminUsers.id, user.id));
  await logAudit({ actor: user.id, action: '2fa.enabled' });
  return { success: true as const, recoveryCodes: codes };
}
