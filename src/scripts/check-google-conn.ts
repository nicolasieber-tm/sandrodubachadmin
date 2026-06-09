// Diagnose: zeigt, ob eine Google-Kalender-Verbindung gespeichert ist.
// Gibt KEINE Token-Werte aus, nur ob vorhanden (Boolean).
// Aufruf: npx tsx --env-file=.env.local src/scripts/check-google-conn.ts
import { db } from '../db';
import { calendarConnections } from '../db/schema';

async function main() {
  const rows = await db.select().from(calendarConnections);
  console.log('calendar_connections Anzahl:', rows.length);
  for (const r of rows) {
    console.log({
      provider: r.provider,
      accountLabel: r.accountLabel,
      status: r.status,
      googleCalendarId: r.googleCalendarId,
      hasAccessToken: Boolean(r.accessTokenEnc),
      hasRefreshToken: Boolean(r.refreshTokenEnc),
      tokenExpiry: r.tokenExpiry,
    });
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
