import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { locations, type Location } from '@/db/schema';

export async function listAllLocations(): Promise<Location[]> {
  return db.select().from(locations).orderBy(asc(locations.sortOrder), asc(locations.name));
}

export async function listActiveLocations(): Promise<Location[]> {
  return db
    .select()
    .from(locations)
    .where(eq(locations.active, true))
    .orderBy(asc(locations.sortOrder), asc(locations.name));
}

export async function getLocation(id: string): Promise<Location | undefined> {
  const rows = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
  return rows[0];
}

export type NewLocationData = {
  name: string;
  slug: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  notifyEmail?: string | null;
  active: boolean;
  sortOrder?: number;
};

export async function createLocation(data: NewLocationData): Promise<Location> {
  const [row] = await db.insert(locations).values(data).returning();
  return row;
}

export async function updateLocation(
  id: string,
  data: Partial<NewLocationData>,
): Promise<Location | undefined> {
  const [row] = await db
    .update(locations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(locations.id, id))
    .returning();
  return row;
}

export async function setLocationActive(
  id: string,
  active: boolean,
): Promise<Location | undefined> {
  const [row] = await db
    .update(locations)
    .set({ active, updatedAt: new Date() })
    .where(eq(locations.id, id))
    .returning();
  return row;
}
