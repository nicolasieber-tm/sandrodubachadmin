import { eq } from 'drizzle-orm';
import { db } from '../db';
import { adminUsers } from '../db/schema';
import { hashPassword } from '../lib/password';
import { env } from '../env';

// Hinweis: Seit dem Umstieg auf ENV-Login (ADMIN_EMAIL/ADMIN_PASSWORD) ist
// dieses Skript optional — der Login legt den Admin-Datensatz beim ersten
// Anmelden selbst an. Es bleibt nur als manuelle Vorab-Anlage erhalten.
async function main() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_EMAIL und ADMIN_PASSWORD müssen gesetzt sein.');
  }
  const email = env.ADMIN_EMAIL.toLowerCase();
  const existing = (await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1))[0];
  if (existing) { console.log('Admin existiert bereits:', email); return; }
  await db.insert(adminUsers).values({ email, passwordHash: await hashPassword(env.ADMIN_PASSWORD) });
  console.log('Admin angelegt:', email, '— bitte beim ersten Login 2FA einrichten.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
