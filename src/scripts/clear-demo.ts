// Leert die Demo-Daten aus der Datenbank: bookings, offers, availability,
// calendar_connections. admin_users, sessions, discounts und discount_redemptions
// bleiben unberuehrt.
//
// Sicherheit: ohne CLEAR_CONFIRM=1 laeuft das Script nur als Dry-Run (zeigt Counts,
// loescht nichts). So laesst sich vorab pruefen, dass die richtige (Live-)DB getroffen
// wird, bevor etwas geloescht wird.
//
// Aufruf:
//   Dry-Run:  npx tsx --env-file=.env.local src/scripts/clear-demo.ts
//   Loeschen: CLEAR_CONFIRM=1 npx tsx --env-file=.env.local src/scripts/clear-demo.ts
import { sql } from 'drizzle-orm';
import { db } from '../db';
import {
  offers,
  bookings,
  availability,
  calendarConnections,
  discounts,
  discountRedemptions,
} from '../db/schema';

type CountableTable =
  | typeof offers
  | typeof bookings
  | typeof availability
  | typeof calendarConnections
  | typeof discounts
  | typeof discountRedemptions;

async function count(table: CountableTable): Promise<number> {
  const res = await db.select({ v: sql<number>`count(*)::int` }).from(table);
  return Number(res[0]?.v ?? 0);
}

async function snapshot(label: string): Promise<void> {
  console.log(`\n[${label}]`);
  console.log(`  bookings .............. ${await count(bookings)}`);
  console.log(`  offers ................ ${await count(offers)}`);
  console.log(`  availability .......... ${await count(availability)}`);
  console.log(`  calendar_connections .. ${await count(calendarConnections)}`);
  console.log(`  discounts ............. ${await count(discounts)}  (unberuehrt)`);
  console.log(`  discount_redemptions .. ${await count(discountRedemptions)}  (unberuehrt)`);
}

async function main() {
  await snapshot('VORHER');

  if (process.env.CLEAR_CONFIRM !== '1') {
    console.log(
      '\nDRY-RUN: nichts geloescht. Zum Loeschen mit CLEAR_CONFIRM=1 erneut ausfuehren.',
    );
    process.exit(0);
  }

  // FK: bookings.offerId / discounts.offerId = onDelete set null;
  // discount_redemptions.bookingId = onDelete set null. Reihenfolge daher
  // unkritisch; der Sauberkeit halber zuerst die abhaengigen Buchungen.
  await db.delete(bookings);
  await db.delete(offers);
  await db.delete(availability);
  await db.delete(calendarConnections);

  await snapshot('NACHHER');
  console.log('\nDemo-Daten geloescht.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
