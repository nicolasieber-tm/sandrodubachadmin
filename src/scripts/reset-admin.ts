// Setzt das Passwort eines Admins zurueck und deaktiviert 2FA (frischer Setup-Flow
// beim naechsten Login). Erstellt den Admin, falls er noch nicht existiert.
// Aufruf:
//   RESET_ADMIN_EMAIL=... RESET_ADMIN_PASSWORD=... \
//   npx tsx --env-file=.env.local src/scripts/reset-admin.ts
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { adminUsers } from '../db/schema';
import { hashPassword } from '../lib/password';

async function main() {
  const email = (process.env.RESET_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.RESET_ADMIN_PASSWORD ?? '';

  if (!email || !password) {
    console.error('RESET_ADMIN_EMAIL und RESET_ADMIN_PASSWORD sind erforderlich.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const updated = await db
    .update(adminUsers)
    .set({ passwordHash, totpEnabled: false, totpSecret: null, recoveryCodes: [] })
    .where(eq(adminUsers.email, email))
    .returning({ id: adminUsers.id });

  if (updated.length === 0) {
    await db.insert(adminUsers).values({ email, passwordHash });
    console.log('ADMIN_CREATED');
  } else {
    console.log('ADMIN_RESET');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
