'use server';

import QRCode from 'qrcode';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminUsers } from '@/db/schema';
import {
  createTotpSecret, buildOtpAuthUri, verifyTotp,
  generateRecoveryCodes, hashRecoveryCodes,
} from '@/lib/totp';
import { setSessionCookie } from './session-cookie';
import { logAudit } from '@/lib/audit';

/** Lädt den User nur, wenn ein gültiges Setup-Pending vorliegt UND 2FA noch nicht aktiv ist. */
async function getSetupUser() {
  const store = await cookies();
  const userId = store.get('sd_setup_pending')?.value;
  if (!userId) return null;
  const user = (await db.select().from(adminUsers).where(eq(adminUsers.id, userId)).limit(1))[0];
  if (!user || user.totpEnabled) return null;
  return user;
}

export async function startTotpSetup(): Promise<{ secret: string; qr: string } | null> {
  const user = await getSetupUser();
  if (!user) return null;
  const secret = createTotpSecret();
  await db.update(adminUsers).set({ totpSecret: secret }).where(eq(adminUsers.id, user.id));
  const uri = buildOtpAuthUri(user.email, secret);
  const qr = await QRCode.toDataURL(uri);
  return { secret, qr };
}

export async function confirmTotpSetup(_prev: unknown, formData: FormData) {
  const user = await getSetupUser();
  if (!user || !user.totpSecret) return { error: 'Keine Einrichtung aktiv. Bitte erneut anmelden.' };
  const token = String(formData.get('token') ?? '');
  if (!verifyTotp(user.totpSecret, token)) return { error: 'Code stimmt nicht.' };

  const codes = generateRecoveryCodes(8);
  const hashes = await hashRecoveryCodes(codes);
  await db.update(adminUsers)
    .set({ totpEnabled: true, recoveryCodes: hashes, lastLoginAt: new Date() })
    .where(eq(adminUsers.id, user.id));

  // 2FA aktiv → Setup-Pending entfernen und erst JETZT volle Session ausstellen.
  const store = await cookies();
  store.delete('sd_setup_pending');
  await setSessionCookie(user.id);
  await logAudit({ actor: user.id, action: '2fa.enabled' });
  return { success: true as const, recoveryCodes: codes };
}
