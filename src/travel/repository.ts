import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { travelRules, type TravelRule } from '@/db/schema';

export async function listTravelRules(): Promise<TravelRule[]> {
  return db.select().from(travelRules).orderBy(asc(travelRules.name));
}

export async function getTravelRule(id: string): Promise<TravelRule | undefined> {
  const rows = await db.select().from(travelRules).where(eq(travelRules.id, id)).limit(1);
  return rows[0];
}

// Eingabedaten zum Anlegen einer Regel. Ansatz IMMER in Rappen.
export type NewTravelRuleData = {
  name: string;
  baseLocation: string;
  baseLat: number | null;
  baseLng: number | null;
  freeRadiusKm: number;
  ratePerKmRappen: number;
};

export async function createTravelRule(data: NewTravelRuleData): Promise<TravelRule> {
  const [row] = await db.insert(travelRules).values(data).returning();
  return row;
}

export async function updateTravelRule(
  id: string,
  data: Partial<NewTravelRuleData>,
): Promise<TravelRule | undefined> {
  const [row] = await db
    .update(travelRules)
    .set(data)
    .where(eq(travelRules.id, id))
    .returning();
  return row;
}

export async function deleteTravelRule(id: string): Promise<void> {
  // offers.travelRuleId ist `onDelete: 'set null'` – zugeordnete Angebote
  // verlieren nur die Regel, sonst passiert nichts.
  await db.delete(travelRules).where(eq(travelRules.id, id));
}
