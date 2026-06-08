import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { offers, type Offer } from '@/db/schema';

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
