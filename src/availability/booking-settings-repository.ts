import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { bookingSettings, type BookingSettings } from '@/db/schema';

// Liest die Singleton-Zeile (oder null, wenn noch keine existiert).
export async function getBookingSettings(): Promise<BookingSettings | null> {
  const rows = await db.select().from(bookingSettings).limit(1);
  return rows[0] ?? null;
}

// Komfort: nur der Monatswert. Kein Eintrag / null → unbegrenzt.
export async function getMaxAdvanceMonths(): Promise<number | null> {
  const row = await getBookingSettings();
  return row?.maxAdvanceMonths ?? null;
}

// Upsert der einzelnen Singleton-Zeile. months = null → unbegrenzt.
export async function setMaxAdvanceMonths(months: number | null): Promise<void> {
  const existing = await getBookingSettings();
  if (existing) {
    await db
      .update(bookingSettings)
      .set({ maxAdvanceMonths: months, updatedAt: new Date() })
      .where(eq(bookingSettings.id, existing.id));
  } else {
    await db.insert(bookingSettings).values({ maxAdvanceMonths: months });
  }
}
