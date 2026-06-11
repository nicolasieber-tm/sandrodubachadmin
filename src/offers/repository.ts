import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { offers, type Offer } from '@/db/schema';
import type { CustomFieldDef } from './custom-fields';

export async function listActiveOffers(): Promise<Offer[]> {
  return db
    .select()
    .from(offers)
    .where(eq(offers.active, true))
    .orderBy(asc(offers.sortOrder), asc(offers.name));
}

export async function listAllOffers(): Promise<Offer[]> {
  return db.select().from(offers).orderBy(asc(offers.sortOrder), asc(offers.name));
}

export async function getOffer(id: string): Promise<Offer | undefined> {
  const rows = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
  return rows[0];
}

// Eingabedaten zum Anlegen eines Angebots. Preis IMMER in Rappen.
export type NewOfferData = {
  name: string;
  priceRappen: number;
  unit: 'pauschal' | 'pro_stunde';
  durationLabel: string;
  durationMinutes: number;
  description: string;
  calendarKey?: string | null;
  bookingMode?: 'termin' | 'anfrage';
  travelRuleId?: string | null;
  active: boolean;
  customFields?: CustomFieldDef[];
  sortOrder?: number;
};

export async function createOffer(data: NewOfferData): Promise<Offer> {
  const [row] = await db.insert(offers).values(data).returning();
  return row;
}

export async function updateOffer(
  id: string,
  data: Partial<NewOfferData>,
): Promise<Offer | undefined> {
  const [row] = await db
    .update(offers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(offers.id, id))
    .returning();
  return row;
}

export async function deleteOffer(id: string): Promise<void> {
  // Bookings behalten ihre Daten via `offer_name_snapshot`; die FK ist
  // `onDelete: 'set null'`, daher ist ein hartes Löschen unbedenklich.
  await db.delete(offers).where(eq(offers.id, id));
}

export async function setOfferActive(
  id: string,
  active: boolean,
): Promise<Offer | undefined> {
  const [row] = await db
    .update(offers)
    .set({ active, updatedAt: new Date() })
    .where(eq(offers.id, id))
    .returning();
  return row;
}
