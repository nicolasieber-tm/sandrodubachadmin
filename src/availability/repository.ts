import 'server-only';
import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { availability, type Availability } from '@/db/schema';

// Alle Verfügbarkeits-Zeilen, sortiert nach Wochentag (0=Montag … 6=Sonntag).
// Ist die Tabelle leer, kommt ein leeres Array zurück; das UI rendert dann
// aus Defaults sieben Zeilen.
export async function getAvailability(): Promise<Availability[]> {
  return db.select().from(availability).orderBy(asc(availability.weekday));
}

// Eingabedaten einer einzelnen Verfügbarkeits-Zeile.
export type AvailabilityRow = {
  weekday: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

// Pro Wochentag ein Upsert: existiert die Zeile (per unique `weekday`),
// werden die Felder aktualisiert, sonst neu eingefügt.
export async function updateAvailability(
  rows: AvailabilityRow[],
): Promise<void> {
  for (const row of rows) {
    await db
      .insert(availability)
      .values({
        weekday: row.weekday,
        enabled: row.enabled,
        startTime: row.startTime,
        endTime: row.endTime,
      })
      .onConflictDoUpdate({
        target: availability.weekday,
        set: {
          enabled: row.enabled,
          startTime: row.startTime,
          endTime: row.endTime,
        },
      });
  }
}
