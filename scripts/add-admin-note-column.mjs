// Idempotente, additive Schema-Erweiterung: bookings.admin_note (text, null).
// Interne Notizen von Sandro zu einem Termin (Planer-Abschlussdialog +
// Termindetail). Wird MANUELL und nur nach Freigabe ausgefuehrt:
//
//   node --env-file=.env.local scripts/add-admin-note-column.mjs
//
// Begruendung (Projekt-Konvention): Schema-Aenderungen NUR in src/db/schema.ts;
// kein db:generate/db:migrate. Statt db:push (braucht interaktives TTY) ein
// chirurgisches ADD COLUMN IF NOT EXISTS. Es fasst NICHTS anderes an.
//
// SSL: rejectUnauthorized:false wie in src/db/index.ts (Railway-Proxy).
import { Pool } from 'pg';

const url = process.env.DATABASE_URL ?? '';
if (!url) {
  console.error('DATABASE_URL fehlt. Mit --env-file=.env.local starten.');
  process.exit(1);
}

const isLocalDb = url.includes('localhost') || url.includes('127.0.0.1');
const pool = new Pool({
  connectionString: url,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query(
      'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_note text;',
    );
    const check = await client.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'bookings' AND column_name = 'admin_note';`,
    );
    console.log('bookings.admin_note:', check.rows[0] ?? 'FEHLT (unerwartet)');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
