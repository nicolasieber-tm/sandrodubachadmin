// Idempotentes Setup der E-Mail-Tabellen (Vorlagen, Reminder-Regeln, Versand-
// Marker). Wird MANUELL vom Hauptagenten ausgefuehrt:
//
//   node --env-file=.env.local scripts/setup-email-tables.mjs
//
// Begruendung (Projekt-Konvention): Schema-Aenderungen NUR in src/db/schema.ts;
// kein db:generate/db:migrate. Statt db:push schreibt dieses Skript exakt die
// drei neuen Objekte (snake_case, passend zum Drizzle-Schema) und seedet zwei
// Reminder-Regeln (168h + 24h). Es fasst NICHTS anderes an.
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
    // 1) Enum email_template_key idempotent anlegen (CREATE TYPE kennt kein
    //    IF NOT EXISTS -> DO-Block mit Exception-Handler).
    await client.query(`
      DO $$
      BEGIN
        CREATE TYPE email_template_key AS ENUM (
          'received', 'admin_new', 'confirmed', 'reminder', 'rescheduled', 'cancelled'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    // 2) email_templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        template_key email_template_key NOT NULL,
        offer_id uuid REFERENCES offers(id) ON DELETE CASCADE,
        subject text NOT NULL,
        body text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    // Partielle Unique-Indizes (entsprechen dem Drizzle-Schema):
    //  - globale Vorlagen: pro template_key hoechstens eine Zeile mit offer_id IS NULL
    //  - angebotsspezifisch: pro (template_key, offer_id) hoechstens eine Zeile
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS email_templates_key_global_uq
        ON email_templates (template_key)
        WHERE offer_id IS NULL;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS email_templates_key_offer_uq
        ON email_templates (template_key, offer_id)
        WHERE offer_id IS NOT NULL;
    `);

    // 3) reminder_rules
    await client.query(`
      CREATE TABLE IF NOT EXISTS reminder_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        offset_hours integer NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        subject text,
        body text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 4) booking_reminders_sent
    await client.query(`
      CREATE TABLE IF NOT EXISTS booking_reminders_sent (
        booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        rule_id uuid NOT NULL REFERENCES reminder_rules(id) ON DELETE CASCADE,
        sent_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (booking_id, rule_id)
      );
    `);

    // 5) Seed: zwei Standard-Reminder, nur falls noch keine Regel existiert.
    const { rows } = await client.query('SELECT count(*)::int AS n FROM reminder_rules;');
    if (rows[0].n === 0) {
      await client.query(`
        INSERT INTO reminder_rules (offset_hours, enabled) VALUES
          (168, true),
          (24, true);
      `);
      console.log('reminder_rules geseedet: 168h + 24h.');
    } else {
      console.log(`reminder_rules vorhanden (${rows[0].n} Zeilen) – kein Seed.`);
    }

    console.log('E-Mail-Tabellen sind eingerichtet.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Setup fehlgeschlagen:', err);
  process.exit(1);
});
